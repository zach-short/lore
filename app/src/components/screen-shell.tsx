import { Platform } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { View } from "@/tw";

import type { ReactNode } from "react";

type ScreenShellProps = {
  children: ReactNode;
};

/** Screen chrome: token background, native status-bar inset, and a readable
    column on wide viewports (web gets its inset from the top nav instead). */
export function ScreenShell({ children }: ScreenShellProps) {
  const insets = useSafeAreaInsets();
  const paddingTop = Platform.OS === "web" ? 0 : insets.top;
  return (
    <View className="flex-1 bg-bg" style={{ paddingTop }}>
      <View className="w-full max-w-3xl flex-1 self-center">{children}</View>
    </View>
  );
}
