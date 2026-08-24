import { Controller, Post, Body, Headers, HttpCode, HttpStatus } from '@nestjs/common';
import { AuthService } from './auth.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('register')
  async register(
    @Body() body: { name: string; email: string; phone: string; password: string; role?: 'CUSTOMER' | 'AGENT' | 'ADMIN' },
  ) {
    return this.authService.register(body);
  }

  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(@Body() body: { email: string; password: string }) {
    return this.authService.login(body.email, body.password);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Headers('x-refresh-token') token: string) {
    if (!token) return { error: 'Refresh token required' };
    return this.authService.refresh(token);
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Headers('x-refresh-token') token: string) {
    if (token) await this.authService.logout(token);
    return { message: 'Logged out' };
  }
}
