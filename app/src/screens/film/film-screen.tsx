import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { DataEmpty, DataError, DataLoading } from "@/components/data-state";
import { Poster } from "@/components/poster";
import { SectionLabel } from "@/components/section-label";
import { Stars } from "@/components/stars";
import {
  canonProvider,
  letterboxdUrl,
  metaLine,
  reasonFor,
  tmdbUrl,
} from "@/lib/movienight";
import { dismissOrHome } from "@/lib/navigation";
import { STRINGS } from "@/lib/strings";
import { Link, Pressable, ScrollView, Text, View } from "@/tw";

import { BallotRow } from "./ballot-row";
import { useFilm } from "./use-film";

import type { FilmDetail } from "./use-film";

type FilmScreenProps = {
  filmId: number | null;
};

export function FilmScreen({ filmId }: FilmScreenProps) {
  const { query, detail } = useFilm(filmId);
  const insets = useSafeAreaInsets();

  let body;
  if (query.isPending) {
    body = <DataLoading />;
  } else if (query.isError) {
    body = (
      <DataError
        message={query.error instanceof Error ? query.error.message : "Couldn’t load the data."}
        onRetry={() => query.refetch()}
      />
    );
  } else if (!detail) {
    body = <DataEmpty title="That film isn’t in the reel" />;
  } else {
    body = <FilmBody detail={detail} />;
  }

  return (
    <View
      className="flex-1 bg-bg"
      style={{ paddingTop: Platform.OS === "web" ? 0 : Math.max(insets.top - 24, 0) }}
    >
      <View className="w-full max-w-3xl flex-1 self-center">
        <View className="flex-row items-center justify-between px-4 pb-1 pt-3">
          <SectionLabel>Screening notes</SectionLabel>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Close"
            onPress={dismissOrHome}
            className="h-8 w-8 items-center justify-center rounded-full bg-surface-2 active:opacity-70"
          >
            <Text className="text-base text-muted">✕</Text>
          </Pressable>
        </View>
        {body}
      </View>
    </View>
  );
}

type FilmBodyProps = { detail: FilmDetail };

function FilmBody({ detail }: FilmBodyProps) {
  const { film, subset, subsetMembers, membersById, groupStar, conf, feat, region } = detail;
  const reason = reasonFor(
    film,
    { ok: true, key: 0, ann: null, star: groupStar },
    { subset, membersById, feat },
  );
  const lbUrl = letterboxdUrl(film.slug, film.tmdb);
  const externalTmdb = tmdbUrl(film.tmdb);

  return (
    <ScrollView
      className="flex-1"
      contentContainerClassName="gap-5 px-4 pb-16 pt-2"
    >
      <View className="flex-row gap-4">
        <Poster path={film.poster} title={film.title} width="w500" className="w-36" />
        <View className="flex-1 justify-end gap-1.5">
          <Text className="font-display text-4xl leading-10 text-ink">
            {film.title}
          </Text>
          <Text className="text-sm text-muted">
            {film.year ?? "—"} · {metaLine({ ...film, year: null })}
          </Text>
          {film.va ? (
            <Text className="text-xs text-faint">
              TMDB {film.va.toFixed(1)} ({film.vc?.toLocaleString()} votes)
            </Text>
          ) : null}
          {groupStar != null ? (
            <View className="mt-1 flex-row items-center gap-2">
              <Stars value={groupStar} size="lg" />
              <Text className="text-xs text-faint">for tonight’s crew</Text>
            </View>
          ) : null}
        </View>
      </View>

      {reason ? (
        <Text className="text-sm leading-5 text-ink">{reason}</Text>
      ) : null}

      <View className="gap-2">
        <SectionLabel>The ballot</SectionLabel>
        {subsetMembers.map((member) => (
          <BallotRow key={member.id} member={member} film={film} conf={conf} />
        ))}
      </View>

      <WhereToWatch film={film} region={region} />

      <View className="flex-row gap-2">
        <Link href={lbUrl} asChild>
          <Pressable
            accessibilityRole="link"
            accessibilityLabel="Open on Letterboxd"
            className="flex-1 items-center rounded-full bg-lamp py-2.5 active:opacity-80"
          >
            <Text className="font-semibold text-on-lamp">Letterboxd</Text>
          </Pressable>
        </Link>
        {externalTmdb ? (
          <Link href={externalTmdb} asChild>
            <Pressable
              accessibilityRole="link"
              accessibilityLabel="Open on TMDB"
              className="flex-1 items-center rounded-full border border-line bg-surface py-2.5 active:bg-surface-2"
            >
              <Text className="font-semibold text-ink">TMDB</Text>
            </Pressable>
          </Link>
        ) : null}
      </View>
    </ScrollView>
  );
}

type WhereToWatchProps = {
  film: FilmDetail["film"];
  region: string | undefined;
};

function WhereToWatch({ film, region }: WhereToWatchProps) {
  const flat = [...new Set((film.pv.f ?? []).map(canonProvider))];
  const rent = [...new Set((film.pv.r ?? []).map(canonProvider))];
  const hasAny = flat.length > 0 || rent.length > 0;

  return (
    <View className="gap-2">
      <SectionLabel>Where to watch{region ? ` · ${region}` : ""}</SectionLabel>
      {flat.length ? (
        <View className="flex-row flex-wrap gap-1.5">
          {flat.map((provider) => (
            <View key={provider} className="rounded-md bg-surface-2 px-2 py-1">
              <Text className="text-xs font-semibold text-ink">{provider}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {rent.length ? (
        <Text className="text-xs text-muted">rent/buy: {rent.slice(0, 6).join(" · ")}</Text>
      ) : null}
      {!hasAny ? (
        <Text className="text-xs text-muted">Not streaming anywhere we track.</Text>
      ) : null}
      {hasAny ? (
        <Text className="text-xs text-faint">
          streaming data: {STRINGS.justWatch}, via TMDB
        </Text>
      ) : null}
    </View>
  );
}
