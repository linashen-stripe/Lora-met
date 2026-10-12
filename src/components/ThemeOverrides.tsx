'use client';

import { useConfigContext } from '@/contexts/ConfigContext';
import {
  getTextColor,
  hexToHSL,
  changeHexColor,
  getLuminance,
  getForegroundColor,
} from '@/utils/helpers';

export default function ThemeOverrides() {
  const { settings } = useConfigContext();

  const primaryColor = settings?.primaryColor;
  const backgroundColor = settings?.backgroundColor;

  if (!primaryColor || !backgroundColor) {
    return null;
  }

  // Convert colors to HSL
  const primaryHSL = hexToHSL(primaryColor);
  const backgroundHSL = hexToHSL(backgroundColor);

  // Calculate text colors for buttons, etc.
  const primaryForegroundHex = getTextColor(primaryColor);
  const primaryForegroundHSL = hexToHSL(primaryForegroundHex);

  // Use the specific function for the main foreground color
  const backgroundForegroundHex = getForegroundColor(backgroundColor);
  const backgroundForegroundHSL = hexToHSL(backgroundForegroundHex);

  // Create hover state
  const primaryHoverHex = changeHexColor(primaryColor);

  // Muted colors
  const backgroundLuminance = getLuminance(backgroundColor);
  const mutedHex = changeHexColor(backgroundColor);
  const mutedHSL = hexToHSL(mutedHex);
  // Use getTextColor to ensure proper contrast for muted text
  const mutedForegroundHex = getTextColor(mutedHex);
  const mutedForegroundHSL = hexToHSL(mutedForegroundHex);

  return (
    <style>{`
      :root {
        /* Main background and text, now using the correct foreground function */
        --background: ${backgroundHSL};
        --foreground: ${backgroundForegroundHSL};

        /* Cards use the same values */
        --card: ${backgroundHSL};
        --card-foreground: ${backgroundForegroundHSL};
        --popover: ${backgroundHSL};
        --popover-foreground: ${backgroundForegroundHSL};

        /* Primary/Accent colors */
        --primary: ${primaryHSL};
        --primary-foreground: ${primaryForegroundHSL};
        --accent: ${primaryHSL};
        --accent-foreground: ${primaryForegroundHSL};

        /* Muted (subtle backgrounds and text) */
        --muted: ${mutedHSL};
        --muted-foreground: ${mutedForegroundHSL};

        /* Ring color for focus states */
        --ring: ${primaryHSL};

        /* Legacy variables for backward compatibility */
        --purple: ${primaryColor};
        --purple-hover: ${primaryHoverHex};
        --button-color: ${primaryForegroundHex};
        --text-color: ${backgroundForegroundHex};
      }
    `}</style>
  );
}
