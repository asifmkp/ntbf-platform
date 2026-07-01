import {
  Body, Controller, Get, Module, Param, Patch, Post, Injectable, NotFoundException, BadRequestException,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AccessLevel, CandidateStatus, ExitType, LeaveType, UserRole } from '@prisma/client';
import { IsEnum, IsNumber, IsOptional, IsString } from 'class-validator';
import { PrismaService } from '../prisma/prisma.service';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { MinAccessLevel, Roles } from '../common/decorators/access.decorator';

class LeaveDto { @IsEnum(LeaveType) leaveType: LeaveType; @IsString() startDate: string; @IsString() endDate: string; @IsOptional() @IsString() reason?: string; }
class AdvanceDto { @IsNumber() amountRequested: number; @IsOptional() @IsString() reason?: string; @IsOptional() @IsString() deductionPeriod?: string; }
class PayrollDto { @IsString() period: string; }
class CandidateDto { @IsString() name: string; @IsOptional() @IsString() contactInfo?: string; @IsOptional() @IsString() positionApplied?: string; }
class OfferDto { @IsString() candidateId: string; @IsOptional() @IsString() position?: string; @IsNumber() salaryOffered: number; @IsOptional() @IsString() joiningDate?: string; }
class MemoDto { @IsString() title: string; @IsString() content: string; }
class ExitDto { @IsString() employeeId: string; @IsEnum(ExitType) exitType: ExitType; @IsOptional() @IsString() reason?: string; }
class PassportDto { @IsString() employeeId: string; @IsString() passportNo: string; @IsOptional() @IsString() submittedTo?: string; }

@Injectable()
export class HrService {
  constructor(private readonly prisma: PrismaService) {}

  private async employeeOf(userId: string) {
    const e = await this.prisma.employee.findUnique({ where: { userId } });
    if (!e) throw new NotFoundException('No employee record for this user');
    return e;
  }

  // Attendance — self-service for every staff member.
  async checkIn(userId: string) {
    const e = await this.employeeOf(userId);
    const date = new Date(); date.setHours(0, 0, 0, 0);
    return this.prisma.attendance.upsert({
      where: { employeeId_date: { employeeId: e.id, date } },
      create: { employeeId: e.id, department: e.department, date, checkIn: new Date(), status: 'PRESENT' },
      update: { checkIn: new Date() },
    });
  }
  async checkOut(userId: string) {
    const e = await this.employeeOf(userId);
    const date = new Date(); date.setHours(0, 0, 0, 0);
    return this.prisma.attendance.update({ where: { employeeId_date: { employeeId: e.id, date } }, data: { checkOut: new Date() } });
  }
  attendanceFor(employeeId: string) {
    return this.prisma.attendance.findMany({ where: { employeeId }, orderBy: { date: 'desc' }, take: 60 });
  }

  // Leave — submit (self) → Department Admin approves.
  async submitLeave(userId: string, dto: LeaveDto) {
    const e = await this.employeeOf(userId);
    return this.prisma.leaveRequest.create({
      data: { employeeId: e.id, department: e.department, leaveType: dto.leaveType, startDate: new Date(dto.startDate), endDate: new Date(dto.endDate), reason: dto.reason },
    });
  }
  decideLeave(id: string, approve: boolean, approverId: string) {
    return this.prisma.leaveRequest.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', approvedById: approverId } });
  }
  async myLeave(userId: string) {
    const e = await this.employeeOf(userId);
    return this.prisma.leaveRequest.findMany({ where: { employeeId: e.id }, orderBy: { createdAt: 'desc' } });
  }

  // Salary advance — submit (self) → Department Admin approves → deducted next payroll.
  async submitAdvance(userId: string, dto: AdvanceDto) {
    const e = await this.employeeOf(userId);
    return this.prisma.salaryAdvanceRequest.create({
      data: { employeeId: e.id, department: e.department, amountRequested: dto.amountRequested, reason: dto.reason, deductionPeriod: dto.deductionPeriod },
    });
  }
  decideAdvance(id: string, approve: boolean, approverId: string) {
    return this.prisma.salaryAdvanceRequest.update({ where: { id }, data: { status: approve ? 'APPROVED' : 'REJECTED', approvedById: approverId } });
  }

  // Payroll run — gross, statutory + approved-advance deductions, net.
  async runPayroll(dto: PayrollDto) {
    const employees = await this.prisma.employee.findMany({ where: { status: 'ACTIVE' } });
    const results: any[] = [];
    for (const e of employees) {
      const gross = Number(e.salary);
      const advances = await this.prisma.salaryAdvanceRequest.findMany({ where: { employeeId: e.id, status: 'APPROVED', deducted: false } });
      const advTotal = advances.reduce((s, a) => s + Number(a.amountRequested), 0);
      const statutory = gross * 0.05; // placeholder statutory deduction
      const net = gross - statutory - advTotal;
      const pr = await this.prisma.payroll.upsert({
        where: { employeeId_period: { employeeId: e.id, period: dto.period } },
        create: { employeeId: e.id, period: dto.period, grossPay: gross, deductions: statutory + advTotal, netPay: net, status: 'PROCESSED' },
        update: { grossPay: gross, deductions: statutory + advTotal, netPay: net, status: 'PROCESSED' },
      });
      await this.prisma.salaryAdvanceRequest.updateMany({ where: { id: { in: advances.map((a) => a.id) } }, data: { deducted: true } });
      results.push(pr);
    }
    return { period: dto.period, processed: results.length };
  }
  payslips(employeeId: string) {
    return this.prisma.payroll.findMany({ where: { employeeId }, orderBy: { period: 'desc' } });
  }

  // Recruitment
  createCandidate(dto: CandidateDto) { return this.prisma.candidate.create({ data: dto }); }
  updateCandidate(id: string, status: CandidateStatus) { return this.prisma.candidate.update({ where: { id }, data: { status } }); }
  sendOffer(dto: OfferDto) {
    return this.prisma.offerLetter.create({ data: { candidateId: dto.candidateId, position: dto.position, salaryOffered: dto.salaryOffered, joiningDate: dto.joiningDate ? new Date(dto.joiningDate) : undefined, sentDate: new Date() } });
  }
  respondOffer(id: string, accept: boolean) {
    return this.prisma.offerLetter.update({ where: { id }, data: { status: accept ? 'ACCEPTED' : 'REJECTED', responseDate: new Date() } });
  }

  // Passport custody
  recordPassport(dto: PassportDto) {
    return this.prisma.passportRecord.create({ data: { employeeId: dto.employeeId, passportNo: dto.passportNo, submittedTo: dto.submittedTo, submissionDate: new Date() } });
  }
  releasePassport(id: string, releasedBy: string) {
    return this.prisma.passportRecord.update({ where: { id }, data: { status: 'RELEASED', releaseDate: new Date(), releasedBy } });
  }

  // Exit (resignation/termination) → triggers settlement + deactivation on approval.
  recordExit(dto: ExitDto) {
    return this.prisma.exitRecord.create({ data: { employeeId: dto.employeeId, exitType: dto.exitType, reason: dto.reason, noticeDate: new Date() } });
  }
  async approveExit(id: string, approverId: string) {
    const ex = await this.prisma.exitRecord.update({ where: { id }, data: { approvedById: approverId, finalSettlementStatus: 'pending', effectiveDate: new Date() } });
    const emp = await this.prisma.employee.update({ where: { id: ex.employeeId }, data: { status: 'EXITED', exitDate: new Date() } });
    await this.prisma.user.update({ where: { id: emp.userId }, data: { status: 'INACTIVE' } });
    return ex;
  }

  // Memos / announcements
  broadcastMemo(userId: string, dto: MemoDto) {
    return this.prisma.memo.create({ data: { title: dto.title, content: dto.content, postedById: userId } });
  }
  memosFor() {
    return this.prisma.memo.findMany({ orderBy: { postedDate: 'desc' }, take: 50 });
  }
}

@ApiTags('HR & Payroll')
@ApiBearerAuth()
@Controller()
export class HrController {
  constructor(private readonly svc: HrService) {}

  @Roles(UserRole.STAFF)
  @Post('attendance/check-in')
  checkIn(@CurrentUser('id') uid: string) { return this.svc.checkIn(uid); }

  @Roles(UserRole.STAFF)
  @Post('attendance/check-out')
  checkOut(@CurrentUser('id') uid: string) { return this.svc.checkOut(uid); }

  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Get('employees/:id/attendance')
  attendance(@Param('id') id: string) { return this.svc.attendanceFor(id); }

  @Roles(UserRole.STAFF)
  @Post('leave-requests')
  submitLeave(@CurrentUser('id') uid: string, @Body() dto: LeaveDto) { return this.svc.submitLeave(uid, dto); }

  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Patch('leave-requests/:id')
  decideLeave(@Param('id') id: string, @Body('approve') approve: boolean, @CurrentUser('id') uid: string) { return this.svc.decideLeave(id, approve ?? true, uid); }

  @Roles(UserRole.STAFF)
  @Get('leave-requests/me')
  myLeave(@CurrentUser('id') uid: string) { return this.svc.myLeave(uid); }

  @Roles(UserRole.STAFF)
  @Post('salary-advance')
  submitAdvance(@CurrentUser('id') uid: string, @Body() dto: AdvanceDto) { return this.svc.submitAdvance(uid, dto); }

  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Patch('salary-advance/:id')
  decideAdvance(@Param('id') id: string, @Body('approve') approve: boolean, @CurrentUser('id') uid: string) { return this.svc.decideAdvance(id, approve ?? true, uid); }

  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Post('payroll/run')
  runPayroll(@Body() dto: PayrollDto) { return this.svc.runPayroll(dto); }

  @Get('payslips/:employeeId')
  payslips(@Param('employeeId') id: string) { return this.svc.payslips(id); }

  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Post('candidates')
  createCandidate(@Body() dto: CandidateDto) { return this.svc.createCandidate(dto); }

  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Patch('candidates/:id/status')
  updateCandidate(@Param('id') id: string, @Body('status') status: CandidateStatus) { return this.svc.updateCandidate(id, status); }

  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Post('offer-letters')
  sendOffer(@Body() dto: OfferDto) { return this.svc.sendOffer(dto); }

  @Patch('offer-letters/:id/respond')
  respondOffer(@Param('id') id: string, @Body('accept') accept: boolean) { return this.svc.respondOffer(id, accept ?? true); }

  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Post('passport-records')
  recordPassport(@Body() dto: PassportDto) { return this.svc.recordPassport(dto); }

  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Patch('passport-records/:id/release')
  releasePassport(@Param('id') id: string, @CurrentUser('id') uid: string) { return this.svc.releasePassport(id, uid); }

  @Post('exit-records')
  recordExit(@Body() dto: ExitDto) { return this.svc.recordExit(dto); }

  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Patch('exit-records/:id/approve')
  approveExit(@Param('id') id: string, @CurrentUser('id') uid: string) { return this.svc.approveExit(id, uid); }

  @MinAccessLevel(AccessLevel.DEPARTMENT_ADMIN)
  @Post('memos')
  memo(@CurrentUser('id') uid: string, @Body() dto: MemoDto) { return this.svc.broadcastMemo(uid, dto); }

  @Get('memos/me')
  memos() { return this.svc.memosFor(); }
}

@Module({ controllers: [HrController], providers: [HrService] })
export class HrModule {}
