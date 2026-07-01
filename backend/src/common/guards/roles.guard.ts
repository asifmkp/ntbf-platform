import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AccessLevel, Department, UserRole } from '@prisma/client';
import {
  ACCESS_LEVEL_KEY,
  DEPARTMENTS_KEY,
  ROLES_KEY,
} from '../decorators/access.decorator';
import { AuthUser } from '../decorators/current-user.decorator';

const ACCESS_ORDER: Record<AccessLevel, number> = {
  STAFF: 0,
  DEPARTMENT_ADMIN: 1,
  SUPER_ADMIN: 2,
};

/**
 * Enforces the TRD §5 access model:
 *  - @Roles(...)        top-level role gate (CUSTOMER / STAFF / DRIVER)
 *  - @Departments(...)  staff must belong to one of these departments
 *  - @MinAccessLevel()  STAFF < DEPARTMENT_ADMIN < SUPER_ADMIN
 * SUPER_ADMIN bypasses department and access-level checks (cross-department override).
 */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const roles = this.get<UserRole[]>(ROLES_KEY, context);
    const departments = this.get<Department[]>(DEPARTMENTS_KEY, context);
    const minAccess = this.get<AccessLevel>(ACCESS_LEVEL_KEY, context);

    if (!roles && !departments && !minAccess) return true;

    const user = context.switchToHttp().getRequest().user as AuthUser;
    if (!user) throw new ForbiddenException('No authenticated user');

    const isSuperAdmin = user.accessLevel === 'SUPER_ADMIN';

    if (roles?.length && !roles.includes(user.role as UserRole) && !isSuperAdmin) {
      throw new ForbiddenException(`Requires role: ${roles.join(', ')}`);
    }

    if (departments?.length && !isSuperAdmin) {
      if (!user.department || !departments.includes(user.department as Department)) {
        throw new ForbiddenException(`Requires department: ${departments.join(', ')}`);
      }
    }

    if (minAccess && !isSuperAdmin) {
      if (ACCESS_ORDER[user.accessLevel] < ACCESS_ORDER[minAccess]) {
        throw new ForbiddenException(`Requires access level: ${minAccess}`);
      }
    }

    return true;
  }

  private get<T>(key: string, context: ExecutionContext): T | undefined {
    return this.reflector.getAllAndOverride<T>(key, [
      context.getHandler(),
      context.getClass(),
    ]);
  }
}
