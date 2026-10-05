import { Body, CanActivate, ConflictException, Controller, createParamDecorator, ExecutionContext, ForbiddenException, Get, Injectable, Module, Post, Req, Res, UnauthorizedException, UseGuards } from '@nestjs/common';
import { JwtModule, JwtService } from '@nestjs/jwt';
import { Role } from '@prisma/client';
import { IsDefined, IsEmail, IsString, Matches, MaxLength, MinLength } from 'class-validator';
import { compare, hash } from 'bcryptjs';
import { createHash, randomBytes } from 'crypto';
import { MailService } from './mail';
import { PrismaService } from './prisma';
import { MemoryRateLimitStore, RATE_LIMIT_STORE, RateLimitService } from './rate-limit';
import { digestSessionToken, isSessionUsable, newRefreshToken, newSessionId } from './session-security';
export { RateLimitService } from './rate-limit';

export type AuthUser = { sub: string; email: string; roles: Role[]; sid:string };
type RequestWithUser = { headers: Record<string, string | string[] | undefined>; user?: AuthUser; ip?: string; socket?: { remoteAddress?: string } };
type CookieResponse = { cookie(name:string,value:string,options:ReturnType<typeof cookieOptions>):void; clearCookie(name:string,options:Record<string,unknown>):void };
const refreshCookieName = 'shuk-refresh';
const refreshLifetimeMs = 30 * 24 * 60 * 60 * 1000;
const readCookie = (request: RequestWithUser, name: string) => {
  const value = request.headers.cookie;
  const header = Array.isArray(value) ? value[0] : value;
  return header?.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${name}=`))?.slice(name.length + 1);
};
const cookieOptions = () => ({ httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax' as const, path: '/api/auth', maxAge: refreshLifetimeMs });
export const CurrentUser = createParamDecorator((_data: unknown, context: ExecutionContext) => context.switchToHttp().getRequest<RequestWithUser>().user);
export const RequireRoles = (...roles: Role[]) => UseGuards(JwtAuthGuard, new RolesGuard(roles));

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly db: PrismaService) {}
  async canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<RequestWithUser>();
    const authorization = request.headers.authorization;
    const header = Array.isArray(authorization) ? authorization[0] : authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined;
    if (!token) throw new UnauthorizedException('נדרשת התחברות');
    try {
      const payload = await this.jwt.verifyAsync<AuthUser>(token);
      if(!payload.sid)throw new UnauthorizedException();
      const user = await this.db.user.findUnique({
        where: { id: payload.sub },
        select: { email: true, suspendedAt: true, roles: { select: { role: true } },authSessions:{where:{id:payload.sid,revokedAt:null,expiresAt:{gt:new Date()}},select:{id:true},take:1} },
      });
      if (!user || user.suspendedAt||user.authSessions.length!==1) {
        if (user?.suspendedAt) await this.db.authSession.updateMany({ where: { userId: payload.sub, revokedAt: null }, data: { revokedAt: new Date() } });
        throw new UnauthorizedException();
      }
      request.user = { sub: payload.sub, email: user.email, roles: user.roles.map(({ role }) => role),sid:payload.sid };
      return true;
    }
    catch { throw new UnauthorizedException('ההתחברות אינה תקפה'); }
  }
}

export class RolesGuard implements CanActivate {
  constructor(private readonly allowed: Role[]) {}
  canActivate(context: ExecutionContext) {
    const user = context.switchToHttp().getRequest<RequestWithUser>().user;
    if (!user || !this.allowed.some((role) => user.roles.includes(role))) throw new ForbiddenException('אין הרשאה');
    return true;
  }
}

export const strongPassword=/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{12,128}$/;
export class RegisterDto { @IsEmail() @MaxLength(254) email!: string; @IsDefined({message:'יש להזין סיסמה'}) @IsString() @Matches(strongPassword,{message:'הסיסמה חייבת להכיל 12–128 תווים, אות אנגלית גדולה, אות אנגלית קטנה, מספר וסימן מיוחד'}) password!: string; @IsString() @MinLength(1) @MaxLength(80) firstName!: string; @IsString() @MinLength(1) @MaxLength(80) lastName!: string; }
export class LoginDto { @IsEmail() @MaxLength(254) email!: string; @IsString() @MaxLength(128) password!: string; }
class ForgotPasswordDto { @IsEmail() email!: string; }
class ResetPasswordDto { @IsString() @MinLength(32) @MaxLength(128) token!: string; @IsString() @Matches(strongPassword,{message:'הסיסמה חייבת להכיל לפחות 12 תווים, אות גדולה, אות קטנה, מספר וסימן'}) password!: string; }

@Injectable()
export class AuthService {
  static readonly forgotResponse = 'אם כתובת האימייל רשומה אצלנו, תישלח אליה הודעה עם קישור לאיפוס הסיסמה.';
  constructor(private readonly db: PrismaService, private readonly jwt: JwtService, private readonly mail: MailService) {}
  async register(dto: RegisterDto) {
    const email = dto.email.trim().toLowerCase();
    if (await this.db.user.findUnique({ where: { email } })) throw new ConflictException('כתובת האימייל כבר רשומה');
    const user = await this.db.user.create({ data: { email, passwordHash: await hash(dto.password, 12), firstName: dto.firstName.trim(), lastName: dto.lastName.trim(), roles: { create: { role: Role.CUSTOMER } } }, include: { roles: true } });
    return this.session(user);
  }
  async login(dto: LoginDto) {
    const user = await this.db.user.findUnique({ where: { email: dto.email.trim().toLowerCase() }, include: { roles: true } });
    if (user?.suspendedAt) throw new UnauthorizedException('Account credentials are not valid');
    if (!user || !(await compare(dto.password, user.passwordHash))) throw new UnauthorizedException('האימייל או הסיסמה אינם נכונים');
    return this.session(user);
  }
  async forgotPassword(dto: ForgotPasswordDto) {
    const user = await this.db.user.findUnique({ where: { email: dto.email.trim().toLowerCase() }, select: { id: true, email: true } });
    if (user) {
      const token = randomBytes(32).toString('hex'); const tokenHash = createHash('sha256').update(token).digest('hex');
      await this.db.$transaction([this.db.passwordResetToken.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } }), this.db.passwordResetToken.create({ data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + 45 * 60 * 1000) } })]);
      const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
      await this.mail.sendPasswordReset(user.email, `${appUrl}/reset-password?token=${encodeURIComponent(token)}`);
    }
    return { message: AuthService.forgotResponse };
  }
  async resetPassword(dto: ResetPasswordDto) {
    const tokenHash = createHash('sha256').update(dto.token).digest('hex');
    const reset = await this.db.passwordResetToken.findUnique({ where: { tokenHash }, select: { id: true, userId: true } });
    if (!reset) throw new UnauthorizedException('הקישור לאיפוס הסיסמה אינו תקף או שפג תוקפו');
    const passwordHash = await hash(dto.password, 12); const now = new Date();
    await this.db.$transaction(async (tx) => {
      const claimed = await tx.passwordResetToken.updateMany({ where: { id: reset.id, usedAt: null, expiresAt: { gt: now } }, data: { usedAt: now } });
      if (claimed.count !== 1) throw new UnauthorizedException('הקישור לאיפוס הסיסמה אינו תקף או שפג תוקפו');
      await tx.user.update({ where: { id: reset.userId }, data: { passwordHash } });
      await tx.passwordResetToken.updateMany({ where: { userId: reset.userId, id: { not: reset.id }, usedAt: null }, data: { usedAt: now } });
      await tx.authSession.updateMany({ where: { userId: reset.userId, revokedAt: null }, data: { revokedAt: now } });
      await tx.auditLog.create({data:{actorId:reset.userId,action:'ACCOUNT_PASSWORD_RESET',entityType:'User',entityId:reset.userId,metadata:{sessionsRevoked:true}}});
    });
    return { message: 'הסיסמה שונתה בהצלחה' };
  }
  async refresh(rawToken: string) {
    const tokenHash = digestSessionToken(rawToken);
    const existing = await this.db.authSession.findUnique({ where: { tokenHash }, include: { user: { include: { roles: true } } } });
    if (!existing) throw new UnauthorizedException('Invalid session');
    const now = new Date();
    if (!isSessionUsable(existing,now) || existing.user.suspendedAt) {
      await this.db.authSession.updateMany({ where: { familyId: existing.familyId, revokedAt: null }, data: { revokedAt: now } });
      throw new UnauthorizedException('Invalid session');
    }
    const nextToken = newRefreshToken();
    const nextId = newSessionId();
    const rotated=await this.db.$transaction(async (tx) => {
      const claimed = await tx.authSession.updateMany({ where: { id: existing.id, revokedAt: null, replacedById: null }, data: { revokedAt: now, lastUsedAt: now } });
      if (claimed.count !== 1)return false;
      await tx.authSession.create({ data: { id: nextId, userId: existing.userId, familyId: existing.familyId, tokenHash: digestSessionToken(nextToken), expiresAt: new Date(now.getTime() + refreshLifetimeMs) } });
      await tx.authSession.update({where:{id:existing.id},data:{replacedById:nextId}});
      return true;
    });
    if(!rotated){await this.db.authSession.updateMany({where:{familyId:existing.familyId,revokedAt:null},data:{revokedAt:now}});throw new UnauthorizedException('Invalid session');}
    return { ...(await this.accessSession(existing.user,nextId)), refreshToken: nextToken };
  }
  async logout(rawToken?: string) {
    if (rawToken) await this.db.authSession.updateMany({ where: { tokenHash: digestSessionToken(rawToken), revokedAt: null }, data: { revokedAt: new Date() } });
  }
  async logoutAll(userId: string) { await this.db.authSession.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }); }
  private async session(user: { id: string; email: string; firstName: string; lastName: string; roles: { role: Role }[] }) {
    const refreshToken = newRefreshToken();
    const familyId = newSessionId();
    const created=await this.db.authSession.create({ data: { userId: user.id, familyId, tokenHash: digestSessionToken(refreshToken), expiresAt: new Date(Date.now() + refreshLifetimeMs) } });
    return { ...(await this.accessSession(user,created.id)), refreshToken };
  }
  private async accessSession(user: { id: string; email: string; firstName: string; lastName: string; roles: { role: Role }[] },sid:string) {
    const roles = user.roles.map((x) => x.role);
    return { accessToken: await this.jwt.signAsync({ sub: user.id, email: user.email, roles,sid }), user: { id: user.id, email: user.email, firstName: user.firstName, lastName: user.lastName, roles } };
  }
}

@Controller('auth')
class AuthController {
  constructor(private readonly auth: AuthService, private readonly db: PrismaService, private readonly rateLimit: RateLimitService) {}
  private ip(request: RequestWithUser) { return request.ip ?? request.socket?.remoteAddress ?? 'unknown'; }
  private setRefresh(response: CookieResponse, token: string) { response.cookie(refreshCookieName, token, cookieOptions()); }
  private clearRefresh(response: CookieResponse) { response.clearCookie(refreshCookieName, { ...cookieOptions(), maxAge: undefined }); }
  private publicSession(session: Awaited<ReturnType<AuthService['login']>>) { const { refreshToken, ...result } = session; return result; }
  @Post('register') async register(@Body() dto: RegisterDto,@Req() request:RequestWithUser,@Res({passthrough:true}) response:CookieResponse) { await this.rateLimit.consume(`register:${this.ip(request)}`,5,60*60*1000);const session=await this.auth.register(dto);this.setRefresh(response,session.refreshToken);return this.publicSession(session); }
  @Post('login') async login(@Body() dto: LoginDto, @Req() request: RequestWithUser,@Res({passthrough:true}) response:CookieResponse) { await this.rateLimit.consume(`login:${this.ip(request)}`, 10, 15 * 60 * 1000);const session=await this.auth.login(dto);this.setRefresh(response,session.refreshToken);return this.publicSession(session); }
  @Post('refresh') async refresh(@Req() request:RequestWithUser,@Res({passthrough:true}) response:CookieResponse){await this.rateLimit.consume(`refresh:${this.ip(request)}`,30,15*60*1000);const token=readCookie(request,refreshCookieName);if(!token){this.clearRefresh(response);throw new UnauthorizedException('Invalid session');}try{const session=await this.auth.refresh(decodeURIComponent(token));this.setRefresh(response,session.refreshToken);return this.publicSession(session);}catch(error){this.clearRefresh(response);throw error;}}
  @Post('logout') async logout(@Req() request:RequestWithUser,@Res({passthrough:true}) response:CookieResponse){await this.auth.logout(readCookie(request,refreshCookieName));this.clearRefresh(response);return{message:'Logged out'};}
  @UseGuards(JwtAuthGuard) @Post('logout-all') async logoutAll(@CurrentUser() user:AuthUser,@Res({passthrough:true}) response:CookieResponse){await this.auth.logoutAll(user.sub);this.clearRefresh(response);return{message:'Logged out'};}
  @Post('forgot-password') async forgot(@Body() dto: ForgotPasswordDto, @Req() request: RequestWithUser) { await this.rateLimit.consume(`forgot:${this.ip(request)}`, 5, 60 * 60 * 1000); return this.auth.forgotPassword(dto); }
  @Post('reset-password') async reset(@Body() dto: ResetPasswordDto, @Req() request: RequestWithUser) { await this.rateLimit.consume(`reset:${this.ip(request)}`, 10, 60 * 60 * 1000); return this.auth.resetPassword(dto); }
  @UseGuards(JwtAuthGuard) @Get('me') async me(@CurrentUser() user: AuthUser) { return this.db.user.findUniqueOrThrow({ where: { id: user.sub }, select: { id: true, email: true, firstName: true, lastName: true, roles: { select: { role: true } }, seller: { select: { id: true, status: true, store: { select: { slug: true, name: true } } } } } }); }
}

@Module({ imports: [JwtModule.register({ global: true, secret: process.env.JWT_SECRET, signOptions: { expiresIn: '15m', algorithm:'HS256', issuer:'shuk-api', audience:'shuk-web' }, verifyOptions:{algorithms:['HS256'],issuer:'shuk-api',audience:'shuk-web'} })], controllers: [AuthController], providers: [AuthService, JwtAuthGuard, MailService, MemoryRateLimitStore,{provide:RATE_LIMIT_STORE,useExisting:MemoryRateLimitStore},RateLimitService], exports: [JwtAuthGuard,RateLimitService] })
export class AuthModule {}
