import { Role } from './generated/prisma/enums'

export type Action =
  | 'create:proposal'
  | 'edit:own_proposal'
  | 'edit:any_proposal'
  | 'approve:proposal'
  | 'manage:catalog'
  | 'manage:templates'
  | 'manage:users'
  | 'view:audit_log'
  | 'force:status_override'
  | 'lock:tc_template'

/**
 * Permission matrix per role.
 *
 * SALES_EXEC    – own proposals only; no catalog/user management
 * SALES_MANAGER – can approve and edit any proposal; manages catalog
 * ADMIN         – full access
 * SUPER_ADMIN   – full access (same set as ADMIN)
 */
const ROLE_PERMISSIONS: Record<Role, Action[]> = {
  [Role.SALES_EXEC]: ['create:proposal', 'edit:own_proposal'],
  [Role.SALES_MANAGER]: [
    'create:proposal',
    'edit:own_proposal',
    'edit:any_proposal',
    'approve:proposal',
    'manage:catalog',
  ],
  [Role.ADMIN]: [
    'create:proposal',
    'edit:own_proposal',
    'edit:any_proposal',
    'approve:proposal',
    'manage:catalog',
    'manage:templates',
    'view:audit_log',
  ],
  [Role.SUPER_ADMIN]: [
    'create:proposal',
    'edit:own_proposal',
    'edit:any_proposal',
    'approve:proposal',
    'manage:catalog',
    'manage:templates',
    'manage:users',
    'view:audit_log',
    'force:status_override',
    'lock:tc_template',
  ],
}

export function can(user: { role: Role }, action: Action): boolean {
  return ROLE_PERMISSIONS[user.role]?.includes(action) ?? false
}
