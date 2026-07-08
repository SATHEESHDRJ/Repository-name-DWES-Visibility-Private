import { ForbiddenException } from '@nestjs/common';
import type { UserRole } from '../data/mock-store';

export const TECHNICIAN_ROLE: UserRole = 'wiring_technician';

/** Minimal user shape for RBAC checks (Prisma rows or JWT payload). */
export type UserLike = { id: number; role: string | null | undefined };

const PRIVILEGED_ROLES: UserRole[] = [
  'system_admin',
  'ops_director',
  'prod_supervisor',
  'qaqc_engineer',
];

export function isTechnicianRole(role: string | null | undefined): boolean {
  return role === TECHNICIAN_ROLE;
}

export function assertCanViewUserList(caller: UserLike): void {
  if (
    caller.role === 'system_admin' ||
    caller.role === 'ops_director' ||
    caller.role === 'prod_supervisor'
  ) {
    return;
  }
  throw new ForbiddenException('You do not have permission to view the user list');
}

export function assertCanViewUser(caller: UserLike, target: UserLike): void {
  if (caller.role === 'system_admin' || caller.role === 'ops_director') return;
  if (caller.role === 'prod_supervisor') {
    if (!isTechnicianRole(target.role)) {
      throw new ForbiddenException('Supervisors may only view technician accounts');
    }
    return;
  }
  if (caller.role === 'wiring_technician' && caller.id === target.id) return;
  throw new ForbiddenException('You do not have permission to view this user');
}

export function assertCanCreateUser(caller: UserLike, dtoRole: string): void {
  if (caller.role === 'system_admin') return;
  if (caller.role === 'prod_supervisor') {
    if (!isTechnicianRole(dtoRole)) {
      throw new ForbiddenException('Supervisors may only create technician accounts');
    }
    return;
  }
  throw new ForbiddenException('You do not have permission to create users');
}

export function assertCanMutateUser(caller: UserLike, target: UserLike): void {
  if (caller.role === 'system_admin') return;
  if (caller.role === 'prod_supervisor') {
    if (!isTechnicianRole(target.role)) {
      throw new ForbiddenException('Supervisors may only manage technician accounts');
    }
    return;
  }
  if (caller.role === 'wiring_technician' && caller.id === target.id) return;
  throw new ForbiddenException('You do not have permission to modify this user');
}

export function assertCanDeleteUser(caller: UserLike, target: UserLike): void {
  if (caller.role === 'system_admin') return;
  if (caller.role === 'prod_supervisor') {
    if (!isTechnicianRole(target.role)) {
      throw new ForbiddenException('Supervisors may only delete technician accounts');
    }
    return;
  }
  throw new ForbiddenException('You do not have permission to delete users');
}

export function sanitizeUpdateDto(
  caller: UserLike,
  target: UserLike,
  dto: Record<string, unknown>,
): Record<string, unknown> {
  if (caller.role === 'system_admin') return { ...dto };

  if (caller.role === 'prod_supervisor') {
    const allowed: Record<string, unknown> = {};
    if (dto.full_name !== undefined) allowed.full_name = dto.full_name;
    if (dto.employee_id !== undefined) allowed.employee_id = dto.employee_id;
    if (dto.whatsapp_number !== undefined) allowed.whatsapp_number = dto.whatsapp_number;
    if (dto.username !== undefined) allowed.username = dto.username;
    return allowed;
  }

  if (caller.role === 'wiring_technician' && caller.id === target.id) {
    const allowed: Record<string, unknown> = {};
    if (dto.full_name !== undefined) allowed.full_name = dto.full_name;
    if (dto.whatsapp_number !== undefined) allowed.whatsapp_number = dto.whatsapp_number;
    if (dto.password) allowed.password = dto.password;
    return allowed;
  }

  throw new ForbiddenException('You do not have permission to update this user');
}

export function assertRoleChangeAllowed(caller: UserLike, newRole?: string): void {
  if (newRole === undefined) return;
  if (caller.role === 'system_admin') return;
  throw new ForbiddenException('You do not have permission to change user roles');
}

export function isPrivilegedRole(role: string | null | undefined): boolean {
  return PRIVILEGED_ROLES.includes(role as UserRole);
}
