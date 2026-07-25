import { getProfile } from "@/lib/auth";
import { ResetPasswordForm } from "./ResetPasswordForm";

export default async function ResetPasswordPage() {
  // A recovery link routes through /auth/confirm, which verifies the token
  // server-side and sets the session cookie before redirecting here — so by
  // the time this renders, an active session means "show the new-password
  // form", not "request a new link".
  const profile = await getProfile();

  return (
    <div>
      <h1 className="text-2xl font-black text-slate-900">Reset password</h1>
      <p className="mt-1 text-sm text-slate-500">
        We'll email you a secure link to choose a new password.
      </p>
      <div className="mt-6">
        <ResetPasswordForm hasSession={Boolean(profile)} />
      </div>
    </div>
  );
}
