import { useLocalSearchParams } from "expo-router";

import { parseIdParam } from "@/lib/route-params";
import { FilmScreen } from "@/screens/film";

export default function FilmPage() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <FilmScreen filmId={parseIdParam(id)} />;
}

export { RouteError as ErrorBoundary } from "@/components/route-error";
