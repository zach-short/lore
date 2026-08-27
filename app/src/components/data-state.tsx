import { ActivityIndicator, useColorScheme } from "react-native";

import { LogoMark } from "@/components/logo-mark";
import { SectionLabel } from "@/components/section-label";
import { paletteFor } from "@/theme";
import { Pressable, Text, View } from "@/tw";

import type { ReactNode } from "react";

type DataErrorProps = {
  message: string;
  onRetry: () => void;
};

export function DataError({ message, onRetry }: DataErrorProps) {
  return (
    <View className="flex-1 items-center justify-center gap-3 px-8">
      <SectionLabel>Projector trouble</SectionLabel>
      <Text className="text-center text-base text-muted">{message}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Try again"
        onPress={onRetry}
        className="mt-2 rounded-full bg-lamp px-5 py-2 active:opacity-80"
      >
        <Text className="font-semibold text-on-lamp">Try again</Text>
      </Pressable>
    </View>
  );
}

type DataEmptyProps = {
  title: string;
  bodySlot?: ReactNode;
};

export function DataEmpty({ title, bodySlot }: DataEmptyProps) {
  return (
    <View className="flex-1 items-center justify-center gap-2 px-8 py-16">
      <LogoMark tone="faint" className="mb-1 h-10 w-10" />
      <Text className="text-center font-display text-2xl tracking-wide text-ink">
        {title}
      </Text>
      {bodySlot}
    </View>
  );
}

export function DataLoading() {
  const scheme = useColorScheme();
  return (
    <View className="flex-1 items-center justify-center">
      <ActivityIndicator color={paletteFor(scheme).lamp} />
    </View>
  );
}
