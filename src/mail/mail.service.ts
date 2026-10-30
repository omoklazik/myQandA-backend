import { InjectQueue } from '@nestjs/bull';
import { Injectable } from '@nestjs/common';
import type { Queue } from 'bull';
import { SendEmailJob } from './interface/mail.interface';

export interface BulkRecipient {
  email: string;
  first_name: string;
}

@Injectable()
export class MailService {
  constructor(@InjectQueue('mail') private mailQueue: Queue<SendEmailJob>) {}
  private app_name = 'Past Question App';

  // private async sendMail(data: SendEmailJob) {
  //   const response = await this.mailQueue.add('send_email', data, {
  //     attempts: 3,
  //     backoff: { type: 'exponential', delay: 5000 },
  //     removeOnComplete: true,
  //     removeOnFail: false,
  //   });

  //   console.log('sendMail response:', response);

  //   return { message: `Email job added to queue for ${data.to}` };
  // }

  private async sendMail(data: SendEmailJob) {
    const startedAt = Date.now();

    console.log('[MAIL QUEUE] Checking Redis readiness');

    try {
      await this.mailQueue.isReady();

      console.log('[MAIL QUEUE] Redis connection ready', {
        durationMs: Date.now() - startedAt,
      });

      console.log('[MAIL QUEUE] Adding email job', {
        recipient: data.to,
        jobName: 'send_email',
      });

      const response = await this.mailQueue.add('send_email', data, {
        attempts: 3,
        backoff: { type: 'exponential', delay: 5000 },
        removeOnComplete: true,
        removeOnFail: false,
      });

      console.log('[MAIL QUEUE] Email job successfully added', {
        jobId: response.id,
        durationMs: Date.now() - startedAt,
      });

      return {
        message: `Email job added to queue for ${data.to}`,
      };
    } catch (error) {
      console.error('[MAIL QUEUE] Failed to add email job', {
        durationMs: Date.now() - startedAt,
        errorName: error instanceof Error ? error.name : typeof error,
        errorMessage: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined,
      });

      throw error;
    }
  }

  async sendVerificationEmail(to: string, first_name: string, token: string) {
    const response = await this.sendMail({
      to,
      subject: 'Verify your email',
      templateName: 'verify-email.ejs',
      templateData: { first_name, token, app_name: this.app_name },
    });

    console.log('sendVerificationEmail response:', response);
    return response;
  }

  async sendPasswordReset(to: string, first_name: string, token: string) {
    return this.sendMail({
      to,
      subject: 'Password Reset',
      templateName: 'password-reset.ejs',
      templateData: { first_name, token, app_name: this.app_name },
    });
  }

  async sendBulkEmails(
    recipients: BulkRecipient[],
    subject: string,
    additionalTemplateData: Record<string, any> = {},
  ) {
    if (!recipients || recipients.length === 0) {
      return { message: 'No recipients provided.' };
    }

    const defaultJobOpts = {
      attempts: 3,
      backoff: { type: 'exponential' as const, delay: 5000 },
      removeOnComplete: true,
      removeOnFail: false,
    };

    // Format jobs for Bull's addBulk API
    const jobs = recipients.map((recipient) => ({
      name: 'send_email',
      data: {
        to: recipient.email,
        subject,
        templateName: 'plan-activation-email.ejs',
        templateData: {
          ...additionalTemplateData,
          first_name: recipient.first_name,
          app_name: this.app_name,
        },
      },
      opts: defaultJobOpts,
    }));

    await this.mailQueue.addBulk(jobs);

    return {
      message: `Bulk email jobs queued successfully for ${recipients.length} users.`,
    };
  }
}
