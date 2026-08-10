import { useAuthStore } from '../store/useAuthStore';
import type { UserRole } from '../types';

const TECHNICIAN_ROLE: UserRole = 'wiring_technician';

/**
 * Central role → capability mapping (mirrors the backend @Roles matrix).
 * Backend guards are the real security boundary (403); these booleans drive
 * hide of UI so users never see actions they can't perform.
 *
 *  system_admin     → full user CRUD + roles / system settings
 *  ops_director     → read-only user list + team assignments
 *  prod_supervisor  → manage technician accounts on team/projects only
 *  qaqc_engineer    → no user management
 *  wiring_technician→ own profile only (view/update personal info, password)
 */
export function usePermissions() {
  const role = useAuthStore(s => s.user?.role) as UserRole | undefined;
  const userId = useAuthStore(s => s.user?.id);

  const is = (r: UserRole) => role === r;

  const canViewUserList =
    is('system_admin') || is('ops_director') || is('prod_supervisor');

  const canManageAllUsers = is('system_admin');
  const canManageTeamTechnicians = is('prod_supervisor');
  const canViewUsersReadOnly = is('ops_director');
  const canEditOwnProfile = is('wiring_technician');

  return {
    role,
    userId,
    isReadOnly:          is('ops_director'),
    isTechnician:        is('wiring_technician'),

    // Project / panel / document management — supervisor only
    canManageProjects:   is('prod_supervisor'),
    canManagePanels:     is('prod_supervisor'),
    canUploadDocs:       is('prod_supervisor'),
    canAssignWork:       is('prod_supervisor'),
    canReviewReports:    is('prod_supervisor'),

    // QA/QC inspections — qaqc engineer only
    canApproveQC:        is('qaqc_engineer'),

    // User management
    canManageUsers:      canManageAllUsers,
    canViewUserList,
    canManageAllUsers,
    canManageTeamTechnicians,
    canViewUsersReadOnly,
    canEditOwnProfile,
    canCreateUsers:      canManageAllUsers || canManageTeamTechnicians,

    /** Whether the logged-in user may mutate a specific target account. */
    canManageTargetUser: (target: { id?: number; role?: string }) => {
      if (!role) return false;
      if (role === 'system_admin') return true;
      if (role === 'prod_supervisor') return target.role === TECHNICIAN_ROLE;
      if (role === 'wiring_technician') return target.id === userId;
      return false;
    },
  };
}

export type Permissions = ReturnType<typeof usePermissions>;
