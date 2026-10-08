"use server";

import { revalidatePath } from "next/cache";

import { calibrateProtocol, fetchProtocol } from "@/lib/protocols";

// The thin server action behind the Calibration control (ADR-0111). It posts the offset the
// user wants to stand at and revalidates Home, which reads the Protocol server-side — so the
// re-pitched Next Session is on screen without a full reload.
//
// The backend is the real boundary: it owns the ±3 clamp, the frozen performed prefix
// (ADR-0020), and the Sensitive-Constraint caveat. This action adds no rules of its own; it
// carries the two disclosures back so the control can explain the rail and show the caveat.
export interface CalibrateActionResult {
  error: string | null;
  // The offset actually stored — which may differ from the requested one, because the server
  // clamps rather than rejecting a clear intent.
  calibration: number | null;
  // The clamp refused part of the request. The one moment a Calibration is not silent: a
  // control that stops responding without saying why is a defect, and the rail is where the
  // Fitness Level fold takes over.
  atRail: boolean;
  // ADR-0058's caveat-not-refusal: the user carries a Sensitive Constraint and re-pitched
  // anyway, in either direction.
  sensitiveCaveat: boolean;
}

export async function calibrateCurrentProtocol(
  protocolId: number,
  calibration: number,
): Promise<CalibrateActionResult> {
  const result = await calibrateProtocol(protocolId, calibration);

  if (!result.success || !result.data) {
    return {
      error: result.error ?? "Could not re-pitch your protocol.",
      calibration: null,
      atRail: false,
      sensitiveCaveat: false,
    };
  }

  // Home renders the Next Session and the whole remaining queue off this Protocol, and a
  // Calibration moved every un-performed Session in it — so the page, not the layout, is what
  // must re-read. The Mode-style whole-layout revalidation would be unwarranted here: nothing
  // about the shell changed.
  revalidatePath("/dashboard");

  return {
    error: null,
    calibration: result.data.calibration,
    atRail: result.data.calibration_at_rail ?? false,
    sensitiveCaveat: result.data.calibration_sensitive_caveat ?? false,
  };
}

export interface CalibrationReadResult {
  // The offset the server has stored, or `null` when the read did not answer.
  calibration: number | null;
}

// The canonical re-read behind an uncertain calibrate (ADR-0111, "Uncertain results"): when
// the post threw, the control cannot tell a failure before the commit from a lost reply after
// it, so it asks the server what is stored. This never throws for the backend leg — a failed
// read is itself an answer ("unconfirmed") — and the control still catches the browser leg.
export async function readCurrentCalibration(
  protocolId: number,
): Promise<CalibrationReadResult> {
  try {
    const result = await fetchProtocol(protocolId);
    if (!result.success || !result.data) {
      return { calibration: null };
    }
    // If the lost post did commit, Home is still showing the old pitch; re-read it.
    revalidatePath("/dashboard");
    return { calibration: result.data.calibration };
  } catch {
    return { calibration: null };
  }
}
