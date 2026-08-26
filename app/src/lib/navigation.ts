import { router } from "expo-router";

/** Close a modal/sheet safely: deep links and fresh web loads have no history,
    so falling back to Tonight beats an unhandled GO_BACK. */
export function dismissOrHome(): void {
  if (router.canGoBack()) {
    router.back();
  } else {
    router.replace("/");
  }
}
