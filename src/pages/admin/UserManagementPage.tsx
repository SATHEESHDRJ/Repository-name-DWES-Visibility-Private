import UserMgmtTab from './tabs/UserMgmtTab';

/**
 * User Management — its own route (/admin/users).
 * Create / Add User lives at the top of the UserMgmtTab toolbar.
 */
export default function UserManagementPage() {
  return (
    <div className="dash-module dash-module--wide admin-user-module">
      <UserMgmtTab />
    </div>
  );
}
