import { Image as ExpoImage } from "expo-image";
import React from "react";
import { StyleSheet } from "react-native";
import { useCssElement } from "react-native-css";

type CssImageProps = React.ComponentProps<typeof ExpoImage>;

function CssImage(props: CssImageProps) {
  // Remap CSS object-fit/position (from className) onto expo-image props.
  // @ts-expect-error -- objectFit/objectPosition are CSS-only style keys
  const { objectFit, objectPosition, ...style } =
    StyleSheet.flatten(props.style) ?? {};

  return (
    <ExpoImage
      contentFit={objectFit}
      contentPosition={objectPosition}
      {...props}
      style={style}
    />
  );
}

export type ImageProps = CssImageProps & { className?: string };

export function Image(props: ImageProps) {
  return useCssElement(CssImage, props, { className: "style" });
}
Image.displayName = "CSS(Image)";
