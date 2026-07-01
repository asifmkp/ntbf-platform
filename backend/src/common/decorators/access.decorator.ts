import { SetMetadata } from '@nestjs/common';
import { AccessLevel, Department, UserRole } from '@prisma/client';

export const ROLES_KEY = 'roles';
export const DEPARTMENTS_KEY = 'departments';
export const ACCESS_LEVEL_KEY = 'accessLevel';

/** Restrict a route to one or more top-level roles (CUSTOMER / STAFF / DRIVER). */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** Restrict a route to staff in specific departments. */
export const Departments = (...departments: Department[]) =>
  SetMetadata(DEPARTMENTS_KEY, departments);

/**
 * Require a minimum access level. SUPER_ADMIN always satisfies the check
 * (cross-department override authority per TRD §5).
 */
export const MinAccessLevel = (level: AccessLevel) => SetMetadata(ACCESS_LEVEL_KEY, level);
