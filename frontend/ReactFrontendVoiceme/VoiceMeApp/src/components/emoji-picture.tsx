import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';

// Twemoji (CC-BY 4.0, https://github.com/jdecked/twemoji): a large colour
// picture for each emoji, identical on every phone. Pinned so pictures don't
// change under the app.
const TWEMOJI_SVG_BASE = 'https://cdn.jsdelivr.net/gh/jdecked/twemoji@17.0.3/assets/svg/';

const ZERO_WIDTH_JOINER = '‍';
const VARIATION_SELECTOR_16 = /️/g;

// Twemoji names files by the emoji's code points ("1f6cf.svg"), dropping the
// FE0F variation selector except inside ZWJ sequences such as 🧑‍⚕️.
const twemojiUrl = (emoji: string): string | null => {
    const trimmed = emoji.trim();
    if (!trimmed) return null;
    const text = trimmed.includes(ZERO_WIDTH_JOINER) ? trimmed : trimmed.replace(VARIATION_SELECTOR_16, '');
    const codePoints = Array.from(text).map((char) => char.codePointAt(0)!.toString(16));
    return `${TWEMOJI_SVG_BASE}${codePoints.join('-')}.svg`;
};

// Shows the emoji as a picture, falling back to the plain emoji when offline
// (before the picture was ever loaded) or when Twemoji has no picture for it.
export function EmojiPicture({ emoji, size }: { emoji: string; size: number }) {
    const [failed, setFailed] = useState(false);
    const url = twemojiUrl(emoji);

    if (!url || failed) {
        return (
            <View style={[styles.box, { width: size, height: size }]}>
                <Text style={{ fontSize: size * 0.7 }}>{emoji}</Text>
            </View>
        );
    }

    return (
        <Image
            source={{ uri: url }}
            style={{ width: size, height: size }}
            contentFit="contain"
            // Kept in the phone's own image cache, so a picture seen once
            // still shows without internet.
            cachePolicy="disk"
            onError={() => setFailed(true)}
            accessible={false}
        />
    );
}

const styles = StyleSheet.create({
    box: { alignItems: 'center', justifyContent: 'center' },
});
