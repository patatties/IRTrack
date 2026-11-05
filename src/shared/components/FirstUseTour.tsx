import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

const STEPS = {
  portal: [
    [
      "Welcome to IRTrack",
      "This is where you find out what to do when something goes wrong at work.",
    ],
    [
      "Start with what you see",
      "Type it in your own words or pick a common situation. You get clear first steps.",
    ],
    [
      "Report and call",
      "The buttons for reporting and for finding who to call are always visible.",
    ],
  ],
  admin: [
    [
      "The Admin Console",
      "Here incident managers see every incident from all sources in one place.",
    ],
    ["Click anything", "Every number and chart opens the incidents behind it."],
    ["Escalate with care", "IRT and CRT activation explain what changes before you confirm."],
  ],
} as const;

export function FirstUseTour({ area }: { area: keyof typeof STEPS }) {
  const key = `irtrack.tour.${area}`;
  const [step, setStep] = useState(-1);
  useEffect(() => {
    if (!localStorage.getItem(key)) setStep(0);
  }, [key]);
  const done = () => {
    localStorage.setItem(key, "1");
    setStep(-1);
  };
  const s = STEPS[area][step];
  return (
    <Dialog open={step >= 0} onOpenChange={(o) => !o && done()}>
      <DialogContent>
        {s && (
          <>
            <DialogHeader>
              <DialogTitle>{s[0]}</DialogTitle>
              <DialogDescription>{s[1]}</DialogDescription>
            </DialogHeader>
            <p className="text-xs text-muted-foreground">
              Step {step + 1} of {STEPS[area].length}
            </p>
            <DialogFooter>
              <Button variant="ghost" onClick={done}>
                Skip tour
              </Button>
              <Button onClick={() => (step + 1 < STEPS[area].length ? setStep(step + 1) : done())}>
                {step + 1 < STEPS[area].length ? "Next" : "Get started"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
