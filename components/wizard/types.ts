export interface DistributionType {
  id: string;
  label: string;
  icon: string;
  description: string;
}

/**
 * One underlying flow for every distribution type — only the copy and icon
 * differ. Logic is never forked per type.
 */
export const DISTRIBUTION_TYPES: DistributionType[] = [
  {
    id: "investor",
    label: "Investor distribution",
    icon: "◈",
    description: "Settle allocations without exposing cap-table terms.",
  },
  {
    id: "team",
    label: "Team payout",
    icon: "⬡",
    description: "Pay the team on-chain without leaking the salary table.",
  },
  {
    id: "dao",
    label: "DAO contributor rewards",
    icon: "⬢",
    description: "Compensate contributors without comp becoming governance drama.",
  },
  {
    id: "community",
    label: "Community rewards",
    icon: "✦",
    description: "Run reward campaigns where amounts stay private to each recipient.",
  },
  {
    id: "airdrop",
    label: "Private airdrop",
    icon: "◇",
    description: "Reward early users without publishing who got what.",
  },
  {
    id: "vesting",
    label: "Vesting unlock",
    icon: "◷",
    description: "Release vested tranches without broadcasting individual schedules.",
  },
  {
    id: "grants",
    label: "Ecosystem grant payout",
    icon: "❖",
    description: "Fund grantees without turning grant sizes into public league tables.",
  },
];

export interface WizardState {
  typeId: string | null;
  tokenAddress: string;
  csvText: string;
}

export const WIZARD_STEPS = [
  "Type",
  "Token",
  "Recipients",
  "Privacy",
  "Execute",
  "Share",
] as const;
