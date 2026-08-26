import { Link as RouterLink } from "expo-router";
import React from "react";
import {
  Pressable as RNPressable,
  ScrollView as RNScrollView,
  Text as RNText,
  TextInput as RNTextInput,
  View as RNView,
} from "react-native";
import { useCssElement } from "react-native-css";

/* CSS-enabled wrappers around the primitives, per the Expo Tailwind setup:
   react-native-css needs explicit wrapping, and doing it once here beats
   polyfilling every React Native component (globalClassNamePolyfill: false).
   useCssElement's `const` generics recurse over the primitive's full prop
   union and overflow TS inference on Pressable/ScrollView, so it is shimmed
   once here with the loose signature; the exported wrappers stay fully typed. */
const cssElement = useCssElement as (
  component: React.ComponentType<object>,
  props: object,
  mapping: Record<string, string>,
) => React.ReactElement;

export type ViewProps = React.ComponentProps<typeof RNView> & {
  className?: string;
};

export function View(props: ViewProps) {
  return cssElement(RNView, props, { className: "style" });
}
View.displayName = "CSS(View)";

export type TextProps = React.ComponentProps<typeof RNText> & {
  className?: string;
};

export function Text(props: TextProps) {
  return cssElement(RNText, props, { className: "style" });
}
Text.displayName = "CSS(Text)";

export type PressableProps = React.ComponentProps<typeof RNPressable> & {
  className?: string;
};

const PressableBase = RNPressable as React.ComponentType<object>;

export function Pressable(props: PressableProps) {
  return cssElement(PressableBase, props, { className: "style" });
}
Pressable.displayName = "CSS(Pressable)";

export type TextInputProps = React.ComponentProps<typeof RNTextInput> & {
  className?: string;
};

const TextInputBase = RNTextInput as React.ComponentType<object>;

export function TextInput(props: TextInputProps) {
  return cssElement(TextInputBase, props, { className: "style" });
}
TextInput.displayName = "CSS(TextInput)";

export type ScrollViewProps = React.ComponentProps<typeof RNScrollView> & {
  className?: string;
  contentContainerClassName?: string;
};

const ScrollViewBase = RNScrollView as React.ComponentType<object>;

export function ScrollView(props: ScrollViewProps) {
  return cssElement(ScrollViewBase, props, {
    className: "style",
    contentContainerClassName: "contentContainerStyle",
  });
}
ScrollView.displayName = "CSS(ScrollView)";

export type LinkProps = React.ComponentProps<typeof RouterLink> & {
  className?: string;
};

const LinkBase = RouterLink as React.ComponentType<object>;

function CssLink(props: LinkProps) {
  return cssElement(LinkBase, props, { className: "style" });
}
CssLink.displayName = "CSS(Link)";

export const Link = Object.assign(CssLink, {
  Trigger: RouterLink.Trigger,
  Menu: RouterLink.Menu,
  MenuAction: RouterLink.MenuAction,
  Preview: RouterLink.Preview,
});
