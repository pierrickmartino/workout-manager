import Link from "next/link";

import { GenerateSessionForm } from "@/components/GenerateSessionForm";

// Request a single, standalone Session. On success the action redirects to the
// generated session's page where its Exercise Prescriptions are displayed.
export default function NewSessionPage() {
  return (
    <section>
      <h1>Generate a workout</h1>
      <p>
        Pick a training type, a duration, and the equipment you have. We&apos;ll
        generate a standalone session tailored to it.
      </p>
      <GenerateSessionForm />
      <p>
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>
    </section>
  );
}
