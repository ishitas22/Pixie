import { Fredoka_700Bold } from '@expo-google-fonts/fredoka/700Bold';
import { Nunito_400Regular } from '@expo-google-fonts/nunito/400Regular';
import { Nunito_600SemiBold } from '@expo-google-fonts/nunito/600SemiBold';
import { Nunito_800ExtraBold } from '@expo-google-fonts/nunito/800ExtraBold';
import { Nunito_500Medium } from '@expo-google-fonts/nunito/500Medium';
import { Nunito_700Bold } from '@expo-google-fonts/nunito/700Bold';
import { useFonts } from 'expo-font';
import { Link as RouterLink } from 'expo-router';
import { createContext, forwardRef, useContext, type ComponentProps, type ComponentRef, type PropsWithChildren } from 'react';
import { ActivityIndicator, Platform, StyleSheet, Text as NativeText, TextInput as NativeTextInput, View, type TextProps, type TextInputProps, type TextStyle } from 'react-native';
const FontsReady = createContext(false);
export function TypographyProvider({ children }: PropsWithChildren) {
  const [loaded, error] = useFonts({ PixieWordmark: Fredoka_700Bold, PixieHeading: Nunito_800ExtraBold, PixieBodyMedium: Nunito_500Medium, PixieBody: Nunito_400Regular, PixieBodySemibold: Nunito_600SemiBold, PixieBodyBold: Nunito_700Bold });
  if (!loaded && !error) return <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFCF8' }}><ActivityIndicator accessibilityLabel="Loading Pixie fonts" color="#69509A" /></View>;
  return <FontsReady.Provider value={loaded}>{children}</FontsReady.Provider>;
}
function fontStyle(style: TextStyle, loaded: boolean, heading = false): TextStyle {
  const isHeading = heading || style.fontFamily === 'PixieHeading';
  const bold = style.fontWeight === 'bold' || Number(style.fontWeight) >= 700;
  const semibold = Number(style.fontWeight) >= 600;
  const face = style.fontFamily === 'PixieWordmark' ? 'PixieWordmark' : isHeading ? 'PixieHeading' : bold ? 'PixieBodyBold' : semibold ? 'PixieBodySemibold' : Number(style.fontWeight) >= 500 ? 'PixieBodyMedium' : 'PixieBody';
  return { fontFamily: Platform.OS === 'web' ? `${loaded ? `${face}, ` : ''}"Trebuchet MS", Arial, sans-serif` : loaded ? face : undefined, fontWeight: loaded ? 'normal' : style.fontWeight };
}
export const Text = forwardRef<ComponentRef<typeof NativeText>, TextProps>(function PixieText(props, ref) {
  const loaded = useContext(FontsReady);
  return <NativeText {...props} ref={ref} style={[props.style, fontStyle(StyleSheet.flatten(props.style) ?? {}, loaded, props.role === 'heading' || props.accessibilityRole === 'header')]} />;
});
export const TextInput = forwardRef<ComponentRef<typeof NativeTextInput>, TextInputProps>(function PixieInput(props, ref) {
  const loaded = useContext(FontsReady);
  return <NativeTextInput {...props} ref={ref} style={[props.style, fontStyle(StyleSheet.flatten(props.style) ?? {}, loaded)]} />;
});
export function Link(props: ComponentProps<typeof RouterLink>) {
  const loaded = useContext(FontsReady);
  return <RouterLink {...props} style={props.asChild ? props.style : [props.style, fontStyle(StyleSheet.flatten(props.style) ?? {}, loaded)]} />;
}
