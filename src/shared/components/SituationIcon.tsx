import {
  DoorOpen,
  Droplets,
  Flame,
  HeartPulse,
  Lock,
  Mail,
  MousePointerClick,
  Send,
  ServerCrash,
  ShieldAlert,
  Smartphone,
  Truck,
  HelpCircle,
} from "lucide-react";

const MAP = {
  DoorOpen,
  Droplets,
  Flame,
  HeartPulse,
  Lock,
  Mail,
  MousePointerClick,
  Send,
  ServerCrash,
  ShieldAlert,
  Smartphone,
  Truck,
};
export function SituationIcon({ name, className }: { name: string; className?: string }) {
  const I = MAP[name as keyof typeof MAP] ?? HelpCircle;
  return <I className={className} aria-hidden />;
}
