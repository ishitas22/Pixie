import { useCallback, useRef, useState, type ReactNode } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";

export function DropSurface({
  children,
  disabled = false,
  onFiles,
  style,
  activeStyle,
  label,
}: {
  children: ReactNode;
  disabled?: boolean;
  onFiles: (files: File[]) => void;
  style?: StyleProp<ViewStyle>;
  activeStyle?: StyleProp<ViewStyle>;
  label: string;
}) {
  const onFilesRef = useRef(onFiles);
  const disabledRef = useRef(disabled);
  onFilesRef.current = onFiles;
  disabledRef.current = disabled;
  const [hot, setHot] = useState(false);

  const setHost = useCallback((node: unknown) => {
    const element = node as HTMLElement | null;
    if (!element?.addEventListener) {
      return;
    }
    const over = (event: DragEvent) => {
      event.preventDefault();
      if (!disabledRef.current) {
        setHot(true);
      }
    };
    const leave = () => setHot(false);
    const drop = (event: DragEvent) => {
      event.preventDefault();
      setHot(false);
      if (disabledRef.current) {
        return;
      }
      onFilesRef.current(Array.from(event.dataTransfer?.files ?? []));
    };
    element.addEventListener("dragover", over);
    element.addEventListener("dragleave", leave);
    element.addEventListener("drop", drop);
    return () => {
      element.removeEventListener("dragover", over);
      element.removeEventListener("dragleave", leave);
      element.removeEventListener("drop", drop);
    };
  }, []);

  return (
    <View ref={setHost as never} accessibilityLabel={label} style={[style, hot ? activeStyle : null]}>
      {children}
    </View>
  );
}
