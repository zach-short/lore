import { NativeTabs } from "expo-router/unstable-native-tabs";
import { useColorScheme } from "react-native";

import { paletteFor } from "@/theme";

export function AppTabs() {
  const palette = paletteFor(useColorScheme());

  return (
    <NativeTabs
      backgroundColor={palette.bg}
      indicatorColor={palette.surface2}
      tintColor={palette.lamp}
      labelStyle={{ selected: { color: palette.ink } }}
    >
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Tonight</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="film" md="movie" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="crew">
        <NativeTabs.Trigger.Label>Crew</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="person.3" md="group" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
