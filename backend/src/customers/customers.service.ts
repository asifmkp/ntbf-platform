import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { PrismaService } from '../prisma/prisma.service';
import { CreateCustomerDto, SetCreditDto, UpdateLocationDto } from './dto/customer.dto';

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Sales staff creates a customer account (pending Sales Admin approval). */
  async create(salesmanId: string, dto: CreateCustomerDto) {
    const exists = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (exists) throw new BadRequestException('Email already in use');

    const passwordHash = await bcrypt.hash(Math.random().toString(36).slice(2), 10);
    return this.prisma.user.create({
      data: {
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        passwordHash,
        role: 'CUSTOMER',
        status: 'INACTIVE', // activated on approval
        customerProfile: {
          create: {
            businessName: dto.businessName,
            category: dto.category,
            creditLimit: dto.creditLimit ?? 0,
            locationCapturedById: salesmanId,
            locationCapturedAt: dto.lat != null ? new Date() : undefined,
            addresses:
              dto.lat != null
                ? {
                    create: {
                      line: dto.addressLine ?? 'Captured at visit',
                      lat: dto.lat,
                      lng: dto.lng,
                      isDefault: true,
                    },
                  }
                : undefined,
          },
        },
      },
      include: { customerProfile: { include: { addresses: true } } },
    });
  }

  /** Sales Admin approves a new customer account → activates login. */
  async approve(profileId: string, approverId: string) {
    const profile = await this.prisma.customerProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Customer not found');

    await this.prisma.user.update({ where: { id: profile.userId }, data: { status: 'ACTIVE' } });
    return this.prisma.customerProfile.update({
      where: { id: profileId },
      data: { approved: true, approvedById: approverId },
    });
  }

  /** Set/approve credit limit & period — Finance Admin only (guarded at controller). */
  async setCredit(profileId: string, approverId: string, dto: SetCreditDto) {
    const profile = await this.prisma.customerProfile.findUnique({ where: { id: profileId } });
    if (!profile) throw new NotFoundException('Customer not found');

    return this.prisma.creditTerm.upsert({
      where: { customerId: profileId },
      create: {
        customerId: profileId,
        creditLimit: dto.creditLimit,
        creditPeriodDays: dto.creditPeriodDays,
        agreedDate: new Date(),
        approvedById: approverId,
      },
      update: {
        creditLimit: dto.creditLimit,
        creditPeriodDays: dto.creditPeriodDays,
        approvedById: approverId,
      },
    });
  }

  async getCredit(profileId: string) {
    const term = await this.prisma.creditTerm.findUnique({ where: { customerId: profileId } });
    const outstanding = await this.outstandingBalance(profileId);
    return { ...term, outstanding };
  }

  async updateLocation(profileId: string, salesmanId: string, dto: UpdateLocationDto) {
    const def = await this.prisma.customerAddress.findFirst({
      where: { customerId: profileId, isDefault: true },
    });
    if (def) {
      return this.prisma.customerAddress.update({
        where: { id: def.id },
        data: { lat: dto.lat, lng: dto.lng },
      });
    }
    return this.prisma.customerAddress.create({
      data: { customerId: profileId, line: 'Captured', lat: dto.lat, lng: dto.lng, isDefault: true },
    });
  }

  private async outstandingBalance(profileId: string): Promise<number> {
    const invoices = await this.prisma.invoice.findMany({
      where: { order: { customerId: profileId }, status: { not: 'PAID' } },
    });
    return invoices.reduce((sum, i) => sum + Number(i.totalAmount), 0);
  }
}
