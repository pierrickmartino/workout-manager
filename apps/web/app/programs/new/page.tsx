import Link from "next/link";

import { GenerateProgramForm } from "@/components/GenerateProgramForm";

// Request a multi-week Program. Generation runs off the request path (ADR-0005):
// the form shows progress while a worker builds the plan, then navigates to the
// adopted Program — robust on mobile connections that may drop mid-generation.
export default function NewProgramPage() {
  return (
    <section>
      <h1>Generate a program</h1>
      <p>
        Choose your training type, objective, and schedule. We&apos;ll build a
        full multi-week plan with week-to-week progression.
      </p>
      <GenerateProgramForm />
      <p>
        <Link href="/dashboard">← Back to dashboard</Link>
      </p>
    </section>
  );
}
