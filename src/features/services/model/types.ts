import type { IconName } from "@/components/ui/icon";

export type SituationId = "connect" | "automate" | "build" | "intelligence" | "evolve";

export interface ClientSituation {
  readonly id: SituationId;
  readonly title: string;
  readonly outcome: string;
}

export interface ServiceOffering {
  readonly id: string;
  readonly icon: IconName;
  readonly title: string;
  readonly description: string;
  readonly tasks: readonly string[];
  readonly result: string;
  readonly proof?: { readonly href: string; readonly label: string };
}
