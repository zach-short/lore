import type { Aggregation, Mode } from "@/lib/lore";

/* Every user-facing string lives here so wording can't fork across screens
   (and one day across platforms). Keep the pipeline's honest voice. */

export const MODES: { key: Mode; label: string }[] = [
  { key: "blind", label: "Blind spot" },
  { key: "evangelist", label: "Evangelist" },
  { key: "rewatch", label: "Rewatch" },
];

export function modeHint(mode: Mode, isStrict: boolean): string {
  if (mode === "blind") {
    return `Nobody${isStrict ? " in the whole group" : " here tonight"} has logged these.`;
  }
  if (mode === "evangelist") {
    return "Exactly one of tonight’s crew has seen it — and loved it.";
  }
  return "At least half of tonight’s crew has seen it and rated it high.";
}

export const AGG_LABELS: Record<Aggregation, string> = {
  avg_nomisery: "avg, no misery",
  avg: "plain average",
  least_misery: "least misery",
  most_pleasure: "most pleasure",
};

export const AGG_ORDER: Aggregation[] = [
  "avg_nomisery",
  "avg",
  "least_misery",
  "most_pleasure",
];

export const AGG_HINTS: Record<Aggregation, string> = {
  avg_nomisery:
    "Rank by the group average, but drop anything a confident model says someone would hate.",
  avg: "Rank by the group average, misery included.",
  least_misery: "Rank by the least-happy person’s score. Safe, sometimes beige.",
  most_pleasure: "Rank by the most-excited person’s score. One superfan steers.",
};

export const STRINGS = {
  appName: "Lore",
  tonightLabel: "Tonight",
  nowShowing: "Tonight’s pick",
  runnersUp: "The undercard",
  filters: "Filters",
  crewTitle: "The crew",
  noData: {
    title: "No scored films yet",
    body: "Run the pipeline: uv run lore all (needs a TMDB key in .env — see the repo README).",
  },
  noSubset: { title: "Pick at least one person" },
  noCrew: {
    title: "No crew on this reel yet",
    body: "Your scores land on the projector’s next nightly run. Meanwhile, add friends in the Crew tab — their picks join yours.",
  },
  noResults: { title: "No candidates" },
  noResultsEvangelist: "Evangelist mode needs at least two people selected.",
  noResultsFilters: (isMiseryOn: boolean) =>
    `Nothing matches — loosen the filters${isMiseryOn ? " or switch off the misery floor (plain average)" : ""}.`,
  candidates: (n: number) => `${n} candidate${n === 1 ? "" : "s"}`,
  wildcardFor: (names: string) => `wildcard for ${names}`,
  highConfidence: "high confidence",
  justWatch: "JustWatch",
  attribution:
    "Film data: TMDB. Streaming availability: JustWatch, via TMDB. This product uses the TMDB API but is not endorsed or certified by TMDB.",
  confNote: {
    thin: (names: string, counts: string) =>
      `We barely know ${names}’s taste yet — ${counts}.`,
    weak: (names: string) =>
      `${names}’s ratings don’t track genre and keyword patterns closely.`,
    coda: "Every pick is a wildcard for them, so the cards don’t flag it one by one.",
  },
  login: {
    title: "Box office",
    eyebrow: "Members only",
    intro: "Sign in to bring your Letterboxd history to the group reel.",
    emailLabel: "Email",
    emailPlaceholder: "you@example.com",
    passwordLabel: "Password",
    passwordPlaceholder: "••••••••",
    signIn: "Sign in",
    createAccount: "Create account",
    toSignUp: "New here? Create an account",
    toSignIn: "Already a member? Sign in",
    missingFields: "Email and password, both.",
    confirmSent:
      "Account created — confirm it from your inbox, then sign in here.",
    working: "One moment…",
  },
  onboarding: {
    title: "Roll your reel",
    eyebrow: "Onboarding",
    intro:
      "Letterboxd lets you export everything you’ve ever logged. Grab the zip and hand it over — it’s parsed right here on this device, then stored for the pipeline’s next run.",
    exportHow:
      "On Letterboxd: Settings → Data → Export your data. You’ll get a letterboxd-<you>-….zip.",
    openLetterboxd: "Open Letterboxd data settings",
    pickZip: "Choose the export zip",
    pickAnother: "Choose a different zip",
    parsing: "Reading the reel…",
    summaryTitle: "What’s on the reel",
    usernameLabel: "Letterboxd username",
    usernamePlaceholder: "e.g. zachshort",
    usernameMissing: "We couldn’t spot a username in the zip — type yours in.",
    usernameUnknown:
      "New face — you’re not on the current reel yet. The projector splices you in on its next nightly run.",
    filmsCount: (n: number) => `${n.toLocaleString()} distinct films`,
    ratedCount: (n: number, mean: string) =>
      `${n.toLocaleString()} rated — averaging ${mean}★`,
    watchlistCount: (n: number) => `${n.toLocaleString()} on the watchlist`,
    likesCount: (n: number) => `${n.toLocaleString()} liked`,
    activitySpan: (from: string, to: string) => `Logged ${from} → ${to}`,
    upload: "Send it to the projector",
    uploading: "Uploading…",
    done: "Uploaded. The next pipeline run splices you in.",
    note:
      "Your zip goes to the group’s private bucket, readable only by you and the pipeline. Scores refresh when the projectionist runs it.",
    signOut: "Sign out",
  },
  friends: {
    addTitle: "Add friends",
    searchPlaceholder: "Search a Letterboxd username",
    searchHint:
      "Friends show up here once they’ve signed up and rolled their own reel.",
    searchEmpty: "Nobody by that name has joined yet.",
    add: "Add",
    requestsTitle: "Requests",
    accept: "Accept",
    decline: "Decline",
    cancelRequest: "Cancel",
    waitingOn: (name: string) => `Waiting on ${name}`,
    crewTitle: "Your crew",
    onNextReel:
      "uploaded, not yet scored — they join the reel on the projector’s next run",
    emptyCrew:
      "Your crew is just you so far. Add friends above and picking a movie night crew happens on the Tonight tab.",
    removeFriend: "Remove",
    signOut: "Sign out",
  },
  authUnconfigured:
    "Auth isn’t wired up in this build — set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_KEY in app/.env.",
} as const;
