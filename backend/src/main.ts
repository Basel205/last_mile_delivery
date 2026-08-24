import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // helmet's crossOriginResourcePolicy blocks browser fetch from a different origin.
  // Disable it so the frontend (localhost:5173) can reach the API (localhost:3000).
  app.use(helmet({ crossOriginResourcePolicy: false }));
  app.enableCors({ origin: '*' });

  // Health endpoint to prevent cold starts on free-tier hosting
  const httpAdapter = app.getHttpAdapter();
  httpAdapter.get('/health', (_req: any, res: any) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  const config = new DocumentBuilder()
    .setTitle('Last Mile Delivery API')
    .setDescription('API for LMD Tracker — see /docs for interactive testing')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  await app.listen(process.env.PORT || 3000);
  console.log(`Backend running on http://localhost:${process.env.PORT || 3000}`);
  console.log(`Swagger UI: http://localhost:${process.env.PORT || 3000}/docs`);
}
bootstrap();
