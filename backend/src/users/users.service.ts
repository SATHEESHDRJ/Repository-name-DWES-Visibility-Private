import {
  Injectable, NotFoundException, ConflictException, ForbiddenException, BadRequestException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import type { User, UserRole } from '../data/mock-store';
import {
  TECHNICIAN_ROLE,
  assertCanCreateUser,
  assertCanDeleteUser,
  assertCanMutateUser,
  assertCanViewUser,
  assertCanViewUserList,
  assertRoleChangeAllowed,
  isTechnicianRole,
  sanitizeUpdateDto,
} from './users-rbac';
import { ProductionBootstrapService } from '../auth/production-bootstrap.service';

function safeUser(u: any) {
  const { hashed_password: _hashed_password, ...safe } = u;
  return safe;
}

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private bootstrap: ProductionBootstrapService,
  ) {}

  private async enrichWithTeamProjects(users: any[]) {
    const techUsers = users.filter(u => isTechnicianRole(u.role));
    if (techUsers.length === 0) return users;

    const techIds = techUsers.map(u => u.id);
    const [assignments, projects] = await Promise.all([
      this.prisma.tech_assignments.findMany({
        where: { technician_id: { in: techIds } },
        select: { technician_id: true, project_code: true },
      }),
      this.prisma.projects.findMany({
        select: { code: true, assigned_technicians: true },
      }),
    ]);

    const byId = new Map<number, Set<string>>();
    for (const a of assignments) {
      if (!byId.has(a.technician_id)) byId.set(a.technician_id, new Set());
      byId.get(a.technician_id)!.add(a.project_code);
    }

    const byUsername = new Map<string, Set<string>>();
    for (const p of projects) {
      if (!p.assigned_technicians) continue;
      for (const username of p.assigned_technicians.split(',').map(s => s.trim()).filter(Boolean)) {
        if (!byUsername.has(username)) byUsername.set(username, new Set());
        byUsername.get(username)!.add(p.code);
      }
    }

    return users.map(u => {
      const codes = new Set<string>(byId.get(u.id) ? [...byId.get(u.id)!] : []);
      const fromProject = byUsername.get(u.username);
      if (fromProject) fromProject.forEach(c => codes.add(c));
      return { ...u, team_projects: [...codes].sort() };
    });
  }

  async findAll(caller: User) {
    assertCanViewUserList(caller);

    let users: any[];
    if (caller.role === 'prod_supervisor') {
      users = await this.prisma.users.findMany({
        where: { role: TECHNICIAN_ROLE },
        orderBy: { full_name: 'asc' },
      });
    } else {
      users = await this.prisma.users.findMany({ orderBy: { role: 'asc' } });
    }

    const safe = users.map(safeUser);
    return this.enrichWithTeamProjects(safe);
  }

  async findOne(id: number, caller: User) {
    const u = await this.prisma.users.findUnique({ where: { id } });
    if (!u) throw new NotFoundException(`User ${id} not found`);
    assertCanViewUser(caller, u);
    const [enriched] = await this.enrichWithTeamProjects([safeUser(u)]);
    return enriched;
  }

  async create(
    dto: {
      username: string; password: string; full_name: string;
      employee_id: string; role: UserRole; whatsapp_number?: string;
    },
    caller: User,
  ) {
    assertCanCreateUser(caller, dto.role);

    const existing = await this.prisma.users.findUnique({ where: { username: dto.username } });
    if (existing) throw new ConflictException('Username already exists');
    const hashed = await bcrypt.hash(dto.password, 10);
    const role = caller.role === 'prod_supervisor' ? TECHNICIAN_ROLE : dto.role;
    const user = await this.prisma.users.create({
      data: {
        username: dto.username, hashed_password: hashed, full_name: dto.full_name,
        employee_id: dto.employee_id, role,
        whatsapp_number: dto.whatsapp_number || '', is_active: true,
      },
    });
    return safeUser(user);
  }

  async update(id: number, dto: Partial<{
    username: string;
    full_name: string; employee_id: string; role: UserRole;
    whatsapp_number: string; is_active: boolean; password: string;
  }>, caller: User) {
    const u = await this.prisma.users.findUnique({ where: { id } });
    if (!u) throw new NotFoundException(`User ${id} not found`);
    assertCanMutateUser(caller, u);
    assertRoleChangeAllowed(caller, dto.role);

    const sanitized = sanitizeUpdateDto(caller, u, dto as Record<string, unknown>);
    const data: any = {};
    if (sanitized.username !== undefined) {
      const username = String(sanitized.username).trim();
      if (!username) throw new BadRequestException('Username is required');
      const taken = await this.prisma.users.findUnique({ where: { username } });
      if (taken && taken.id !== id) throw new ConflictException('Username already exists');
      data.username = username;
    }
    if (sanitized.full_name !== undefined)       data.full_name = sanitized.full_name;
    if (sanitized.employee_id !== undefined)     data.employee_id = sanitized.employee_id;
    if (sanitized.role !== undefined)              data.role = sanitized.role;
    if (sanitized.whatsapp_number !== undefined)   data.whatsapp_number = sanitized.whatsapp_number;
    if (sanitized.is_active !== undefined)         data.is_active = sanitized.is_active;
    if (sanitized.password)                        data.hashed_password = await bcrypt.hash(String(sanitized.password), 10);

    if (Object.keys(data).length === 0) {
      throw new ForbiddenException('No permitted fields to update');
    }

    const updated = await this.prisma.users.update({ where: { id }, data });
    if (sanitized.password && caller.id === id) {
      this.bootstrap.recordPasswordRotation(id);
    }
    return safeUser(updated);
  }

  async toggleStatus(id: number, caller: User) {
    const u = await this.prisma.users.findUnique({ where: { id } });
    if (!u) throw new NotFoundException(`User ${id} not found`);
    assertCanMutateUser(caller, u);
    if (caller.role === 'wiring_technician') {
      throw new ForbiddenException('You cannot change account status');
    }
    const updated = await this.prisma.users.update({ where: { id }, data: { is_active: !u.is_active } });
    return safeUser(updated);
  }

  async resetPassword(id: number, password: string, caller: User) {
    const u = await this.prisma.users.findUnique({ where: { id } });
    if (!u) throw new NotFoundException(`User ${id} not found`);
    assertCanMutateUser(caller, u);
    await this.prisma.users.update({ where: { id }, data: { hashed_password: await bcrypt.hash(password, 10) } });
    return { message: 'Password reset successfully' };
  }

  async remove(id: number, caller: User) {
    const u = await this.prisma.users.findUnique({ where: { id } });
    if (!u) throw new NotFoundException(`User ${id} not found`);
    assertCanDeleteUser(caller, u);

    const [assignments, sessions, inspections] = await Promise.all([
      this.prisma.tech_assignments.count({ where: { technician_id: id } }),
      this.prisma.session_log.count({ where: { user_id: id } }),
      this.prisma.panel_inspections.count({ where: { qc_user_id: id } }),
    ]);

    if (assignments > 0 || sessions > 0 || inspections > 0) {
      await this.prisma.users.update({ where: { id }, data: { is_active: false } });
      return {
        message: `User deactivated (cannot delete: ${assignments} assignment(s), ${sessions} session(s), ${inspections} inspection(s) on record)`,
        deactivated: true,
        counts: { assignments, sessions, inspections },
      };
    }

    await this.prisma.users.delete({ where: { id } });
    return { message: 'User deleted', deactivated: false };
  }

  async findTechnicians() {
    const users = await this.prisma.users.findMany({ where: { role: TECHNICIAN_ROLE, is_active: true } });
    return users.map(safeUser);
  }
}
