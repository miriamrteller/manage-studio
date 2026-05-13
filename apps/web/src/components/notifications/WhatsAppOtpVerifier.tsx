import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  useContactPreferences,
  useSendOtpEmail,
  useVerifyWhatsAppOtp,
} from './index';
import { useCurrentUser } from '@/hooks/useCurrentUser';
import { AlertCircle, CheckCircle2 } from 'lucide-react';

type VerificationStep = 'method-select' | 'send-otp' | 'verify-otp' | 'success' | 'error';

const PhoneSchema = z.object({
  phone: z.string().regex(/^\+\d{1,15}$/, 'Invalid phone format (E.164 required)'),
});

const OtpCodeSchema = z.object({
  code: z.string().length(6, 'OTP must be 6 digits').regex(/^\d{6}$/, 'OTP must contain only digits'),
});

/**
 * Component: WhatsAppOtpVerifier
 * Multi-step form to verify WhatsApp number via OTP
 * Includes email fallback if WhatsApp verification fails
 * States: method-select → send-otp → verify-otp → success/error
 */
export function WhatsAppOtpVerifier({
  onVerificationSuccess,
}: {
  onVerificationSuccess?: (phone: string) => void;
}) {
  const { user } = useCurrentUser();
  const { preferences } = useContactPreferences();
  const { sendOtp, isSending } = useSendOtpEmail();
  const { verifyOtp, isVerifying } = useVerifyWhatsAppOtp();

  const [step, setStep] = useState<VerificationStep>('method-select');
  const [method, setMethod] = useState<'email' | 'whatsapp'>('whatsapp');
  const [phoneForVerification, setPhoneForVerification] = useState<string>('');
  const [expiryMinutes, setExpiryMinutes] = useState<number>(10);
  const [error, setError] = useState<string>('');

  // Form: Phone number
  const phoneForm = useForm<z.infer<typeof PhoneSchema>>({
    resolver: zodResolver(PhoneSchema),
    defaultValues: {
      phone: preferences?.whatsapp_number || '',
    },
  });

  // Form: OTP code
  const otpForm = useForm<z.infer<typeof OtpCodeSchema>>({
    resolver: zodResolver(OtpCodeSchema),
    defaultValues: {
      code: '',
    },
  });

  const handleSendOtp = async (data: z.infer<typeof PhoneSchema>) => {
    setError('');
    setPhoneForVerification(data.phone);

    if (method === 'email' && user?.email) {
      // Send OTP via email
      sendOtp(
        {
          email: user.email,
          code: generateOtpCode(),
          expiryMinutes,
        },
        {
          onSuccess: (response) => {
            setExpiryMinutes(response.expiresInMinutes);
            setStep('verify-otp');
          },
          onError: (err) => {
            setError(err.message);
            setStep('error');
          },
        }
      );
    } else {
      // Send OTP via WhatsApp (in real implementation, would call send-otp-whatsapp function)
      // For now, we'll simulate by showing verification step
      setStep('verify-otp');
    }
  };

  const handleVerifyOtp = async (data: z.infer<typeof OtpCodeSchema>) => {
    setError('');

    const phone: string = phoneForVerification ?? '+1234567890';

    verifyOtp(
      {
        phone,
        code: data.code,
        personId: user?.person_id ?? undefined,
      },
      {
        onSuccess: (response) => {
          if (response.verified) {
            setStep('success');
            onVerificationSuccess?.(response.phone);
          } else {
            setError(response.error || 'Verification failed');
            setStep('error');
          }
        },
        onError: (err) => {
          setError(err.message);
          setStep('error');
        },
      }
    );
  };

  const handleReset = () => {
    setStep('method-select');
    setError('');
    setPhoneForVerification('');
    phoneForm.reset();
    otpForm.reset();
  };

  return (
    <Card className="w-full max-w-md">
      <CardHeader>
        <CardTitle>
          {step === 'success'
            ? 'Verification Complete'
            : 'Verify WhatsApp Number'}
        </CardTitle>
        <CardDescription>
          {step === 'success'
            ? 'Your WhatsApp number has been verified'
            : 'Secure your account with WhatsApp notifications'}
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-6">
        {step === 'success' && (
          <div className="space-y-4">
            <Alert className="border-success bg-success-light">
              <CheckCircle2 className="h-4 w-4 text-success" />
              <AlertDescription>
                <div className="text-success-dark">
                  {phoneForVerification} verified successfully!
                </div>
              </AlertDescription>
            </Alert>
            <Button onClick={handleReset} className="w-full">
              Done
            </Button>
          </div>
        )}

        {step === 'error' && (
          <div className="space-y-4">
            <Alert className="border-error bg-error-light">
              <AlertCircle className="h-4 w-4 text-error" />
              <AlertDescription>
                <div className="text-error-dark">
                  {error || 'Verification failed. Please try again.'}
                </div>
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <Button onClick={handleReset} variant="outline" className="w-full">
                Try Again
              </Button>
              {method === 'whatsapp' && user?.email && (
                <Button
                  onClick={() => {
                    setMethod('email');
                    setStep('method-select');
                    setError('');
                  }}
                  variant="ghost"
                  className="w-full"
                >
                  Use Email Instead
                </Button>
              )}
            </div>
          </div>
        )}

        {step === 'method-select' && (
          <div className="space-y-4">
            <Tabs defaultValue={method} onValueChange={(v) => setMethod(v as 'email' | 'whatsapp')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="whatsapp">WhatsApp</TabsTrigger>
                <TabsTrigger value="email">Email</TabsTrigger>
              </TabsList>

              <TabsContent value="whatsapp" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Receive verification code via WhatsApp
                </p>
                <Button
                  onClick={() => setStep('send-otp')}
                  className="w-full"
                  disabled={isSending || isVerifying}
                >
                  Continue with WhatsApp
                </Button>
              </TabsContent>

              <TabsContent value="email" className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  Receive verification code via email
                </p>
                <Button
                  onClick={() => setStep('send-otp')}
                  className="w-full"
                  disabled={isSending || isVerifying}
                >
                  Continue with Email
                </Button>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {step === 'send-otp' && (
          <Form {...phoneForm}>
            <form
              onSubmit={phoneForm.handleSubmit(handleSendOtp)}
              className="space-y-4"
            >
              {method === 'whatsapp' && (
                <FormField
                  control={phoneForm.control}
                  name="phone"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Phone Number</FormLabel>
                      <FormDescription>
                        In E.164 format (e.g., +972123456789)
                      </FormDescription>
                      <FormControl>
                        <Input
                          placeholder="+972123456789"
                          {...field}
                          disabled={isSending || isVerifying}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('method-select')}
                  disabled={isSending || isVerifying}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={isSending || isVerifying}
                  className="flex-1"
                >
                  {isSending ? 'Sending...' : 'Send Code'}
                </Button>
              </div>
            </form>
          </Form>
        )}

        {step === 'verify-otp' && (
          <Form {...otpForm}>
            <form
              onSubmit={otpForm.handleSubmit(handleVerifyOtp)}
              className="space-y-4"
            >
              <Alert className="border-info bg-info-light">
                <AlertDescription>
                  <div className="text-info-dark">
                    {method === 'whatsapp'
                      ? `Verification code sent to ${phoneForVerification}`
                      : `Verification code sent to ${user?.email}`}
                  </div>
                </AlertDescription>
              </Alert>

              <FormField
                control={otpForm.control}
                name="code"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Verification Code</FormLabel>
                    <FormDescription>
                      6-digit code from {method === 'whatsapp' ? 'WhatsApp' : 'email'}
                    </FormDescription>
                    <FormControl>
                      <Input
                        placeholder="000000"
                        {...field}
                        disabled={isVerifying}
                        maxLength={6}
                        inputMode="numeric"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <p className="text-xs text-muted-foreground">
                Code expires in {expiryMinutes} minutes
              </p>

              <div className="flex gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setStep('send-otp')}
                  disabled={isVerifying}
                  className="flex-1"
                >
                  Back
                </Button>
                <Button
                  type="submit"
                  disabled={isVerifying}
                  className="flex-1"
                >
                  {isVerifying ? 'Verifying...' : 'Verify'}
                </Button>
              </div>
            </form>
          </Form>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Helper: Generate 6-digit OTP
 */
function generateOtpCode(): string {
  return Math.floor(Math.random() * 999999)
    .toString()
    .padStart(6, '0');
}
