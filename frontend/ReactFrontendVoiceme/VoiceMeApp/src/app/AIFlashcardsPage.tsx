import React, { useCallback, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    SafeAreaView,
    ScrollView,
    StatusBar,
    StyleSheet,
    Text,
    View,
} from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { API_BASE_URL } from '@/constants/api';
import { EmojiPicture } from '@/components/emoji-picture';

const AUTH_TOKEN_KEY = 'voiceme.authToken';

type Language = 'ne' | 'en';

interface StepCard {
    id: string;
    ne: string;
    en: string;
    icon: string;
    desc_ne: string;
    desc_en: string;
}

interface TimeContext {
    routine_title: string;
    time: string;
    items: StepCard[];
}

interface LocationContext {
    place_category: string;
    location_label: string | null;
    items: StepCard[];
}

interface NeedsContext {
    items: StepCard[];
}

// Lets the whole thing be demoed today, before the physical GPS band with
// its WiFi module exists — each button posts the same place_category the
// real band's coordinates will eventually resolve to server-side.
const TEST_LOCATIONS: { category: string; label: string; icon: string }[] = [
    { category: 'restaurant', label: 'Restaurant', icon: '🍽️' },
    { category: 'school', label: 'School', icon: '🏫' },
    { category: 'park', label: 'Park', icon: '🌳' },
    { category: 'hospital', label: 'Hospital', icon: '🏥' },
    { category: 'store', label: 'Store', icon: '🏪' },
    { category: 'home', label: 'Home', icon: '🏠' },
    { category: 'temple', label: 'Temple', icon: '🛕' },
    { category: 'transport', label: 'Bus', icon: '🚌' },
    { category: 'library', label: 'Library', icon: '📚' },
];

// Same "08:30 AM" shape the backend uses for routine times, built by hand so
// it reads identically on web, iOS and Android regardless of device locale.
const formatClock = (date: Date): string => {
    const hours12 = date.getHours() % 12 || 12;
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${String(hours12).padStart(2, '0')}:${minutes} ${date.getHours() < 12 ? 'AM' : 'PM'}`;
};

// The backend picks the current routine by 30-minute slot, so the cards only
// need re-fetching when the clock crosses into a new slot.
const slotIndex = (date: Date): number => date.getHours() * 2 + (date.getMinutes() >= 30 ? 1 : 0);

const CLOCK_TICK_MS = 15000;

export default function AIFlashcardsPage() {
    const [lang, setLang] = useState<Language>('ne');
    const [timeContext, setTimeContext] = useState<TimeContext | null>(null);
    const [locationContext, setLocationContext] = useState<LocationContext | null>(null);
    const [nextContext, setNextContext] = useState<TimeContext | null>(null);
    const [needsContext, setNeedsContext] = useState<NeedsContext | null>(null);
    // Only the very first load blanks the screen with a spinner; coming back
    // to this screen (or switching test location) refreshes in place so the
    // cards never flash away.
    const hasLoadedRef = useRef(false);
    const [loading, setLoading] = useState(true);
    const [simulating, setSimulating] = useState<string | null>(null);
    const [playingId, setPlayingId] = useState<string | null>(null);
    const [now, setNow] = useState(() => new Date());

    const player = useAudioPlayer(null);
    const playerStatus = useAudioPlayerStatus(player);
    const isPlayingRef = useRef(false);
    const playRequestId = useRef(0);
    const lastPlaybackRef = useRef<{ requestId: number; step: StepCard; lang: Language } | null>(null);
    // Every step gets its one-time Nepali -> English intro the first time
    // it's played, so English is always actually heard rather than sitting
    // behind a toggle someone has to notice. After that, a tap just plays
    // whichever language is currently selected.
    const introPlayedRef = useRef<Set<string>>(new Set());

    const loadContext = useCallback(async () => {
        if (!hasLoadedRef.current) setLoading(true);
        try {
            const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
            if (!token) {
                setTimeContext(null);
                setLocationContext(null);
                return;
            }
            const res = await fetch(`${API_BASE_URL}/api/assistant/flashcards/`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            if (res.ok) {
                const data = await res.json();
                setTimeContext(data.time_context ?? null);
                setLocationContext(data.location_context ?? null);
                setNextContext(data.next_context ?? null);
                setNeedsContext(data.needs_context ?? null);
            }
        } catch {
            // Offline or backend unreachable: keep showing whatever was last loaded.
        } finally {
            hasLoadedRef.current = true;
            setLoading(false);
        }
    }, []);

    useFocusEffect(
        useCallback(() => {
            loadContext();

            // Keep the clock live while this screen is open, and move on to
            // the next routine as soon as its time slot starts.
            let lastSlot = slotIndex(new Date());
            setNow(new Date());
            const interval = setInterval(() => {
                const current = new Date();
                setNow(current);
                if (slotIndex(current) !== lastSlot) {
                    lastSlot = slotIndex(current);
                    loadContext();
                }
            }, CLOCK_TICK_MS);
            return () => clearInterval(interval);
        }, [loadContext])
    );

    const speakStep = async (step: StepCard, targetLang: Language) => {
        if (isPlayingRef.current) return;

        try {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        } catch { }

        const thisRequest = ++playRequestId.current;
        isPlayingRef.current = true;
        setPlayingId(step.id);

        try {
            player.pause();
            player.replace(`${API_BASE_URL}/api/assistant/flashcards/audio/${step.id}/${targetLang}/`);
            await player.seekTo(0);
            lastPlaybackRef.current = { requestId: thisRequest, step, lang: targetLang };
            player.play();
        } catch {
            isPlayingRef.current = false;
            setPlayingId(null);
        }
    };

    const handlePlayStep = (step: StepCard) => {
        speakStep(step, lang);
    };

    React.useEffect(() => {
        if (!playerStatus.didJustFinish) return;
        isPlayingRef.current = false;
        setPlayingId(null);

        const finished = lastPlaybackRef.current;
        if (
            finished &&
            finished.requestId === playRequestId.current &&
            finished.lang === 'ne' &&
            !introPlayedRef.current.has(finished.step.id)
        ) {
            introPlayedRef.current.add(finished.step.id);
            speakStep(finished.step, 'en');
        }
    }, [playerStatus.didJustFinish]);

    const handleSimulateLocation = async (category: string) => {
        try {
            Haptics.selectionAsync();
        } catch { }
        setSimulating(category);
        try {
            const token = await AsyncStorage.getItem(AUTH_TOKEN_KEY);
            if (!token) return;
            await fetch(`${API_BASE_URL}/api/child/gps/`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ place_category: category }),
            });
            await loadContext();
        } catch {
        } finally {
            setSimulating(null);
        }
    };

    const renderSteps = (items: StepCard[]) => (
        <View style={styles.stepList}>
            {items.map((step, index) => {
                const isPlaying = playingId === step.id;
                return (
                    <Pressable
                        key={step.id}
                        accessibilityRole="button"
                        accessibilityLabel={lang === 'ne' ? step.ne : step.en}
                        style={({ pressed }) => [
                            styles.stepCard,
                            isPlaying && styles.stepCardActive,
                            pressed && styles.pressedState,
                        ]}
                        onPress={() => handlePlayStep(step)}
                    >
                        <Text style={styles.stepIndex}>{index + 1}</Text>
                        <View style={styles.stepPicture}>
                            <EmojiPicture emoji={step.icon} size={120} />
                        </View>
                        <View style={styles.stepTextBlock}>
                            <Text style={styles.stepTitle} numberOfLines={2}>
                                {lang === 'ne' ? step.ne : step.en}
                            </Text>
                            <Text style={styles.stepDesc} numberOfLines={2}>
                                {step.desc_ne}
                            </Text>
                            <Text style={styles.stepDescEn} numberOfLines={2}>
                                {step.desc_en}
                            </Text>
                        </View>
                        <View style={[styles.speakerBadge, isPlaying && styles.speakerBadgeActive]}>
                            <Text style={styles.speakerIcon}>{isPlaying ? '🔊' : '🔈'}</Text>
                        </View>
                    </Pressable>
                );
            })}
        </View>
    );

    // Everyday needs are single "I need..." phrases rather than ordered
    // steps, so they sit in a compact two-column board instead of a list.
    const renderNeeds = (items: StepCard[]) => (
        <View style={styles.needsGrid}>
            {items.map((step) => {
                const isPlaying = playingId === step.id;
                return (
                    <Pressable
                        key={step.id}
                        accessibilityRole="button"
                        accessibilityLabel={lang === 'ne' ? step.ne : step.en}
                        style={({ pressed }) => [
                            styles.needCard,
                            isPlaying && styles.stepCardActive,
                            pressed && styles.pressedState,
                        ]}
                        onPress={() => handlePlayStep(step)}
                    >
                        <EmojiPicture emoji={step.icon} size={72} />
                        <Text style={styles.needTitle} numberOfLines={2}>
                            {lang === 'ne' ? step.ne : step.en}
                        </Text>
                        <Text style={styles.needSub} numberOfLines={1}>
                            {lang === 'ne' ? step.en : step.ne}
                        </Text>
                    </Pressable>
                );
            })}
        </View>
    );

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar barStyle="dark-content" backgroundColor="#F4EFE6" />

            <View style={styles.headerRow}>
                <Pressable accessibilityRole="button" accessibilityLabel="Return to home" onPress={() => router.back()} style={styles.backButton}>
                    <Text style={styles.backText}>‹ Home</Text>
                </Pressable>

                <View style={styles.togglePill}>
                    <Pressable
                        onPress={() => setLang('ne')}
                        style={[styles.toggleBtn, lang === 'ne' && styles.toggleBtnActive]}
                    >
                        <Text style={[styles.toggleBtnText, lang === 'ne' && styles.toggleBtnTextActive]}>ने</Text>
                    </Pressable>
                    <Pressable
                        onPress={() => setLang('en')}
                        style={[styles.toggleBtn, lang === 'en' && styles.toggleBtnActive]}
                    >
                        <Text style={[styles.toggleBtnText, lang === 'en' && styles.toggleBtnTextActive]}>EN</Text>
                    </Pressable>
                </View>
            </View>

            <View style={styles.titleBlock}>
                <Text style={styles.title}>🤖 अहिलेको लागि</Text>
                <Text style={styles.subtitle}>Right now, based on time & location</Text>
            </View>

            {loading ? (
                <View style={styles.loadingBlock}>
                    <ActivityIndicator color="#8C461F" />
                </View>
            ) : (
                <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>⏰ अहिलेको समय (Right now)</Text>
                        {timeContext ? (
                            <>
                                <Text style={styles.sectionMeta}>
                                    {formatClock(now)} · {timeContext.routine_title}
                                    {timeContext.time ? ` · since ${timeContext.time}` : ''}
                                </Text>
                                {renderSteps(timeContext.items)}
                            </>
                        ) : (
                            <Text style={styles.emptyHint}>
                                कुनै दिनचर्या फेला परेन। दिनचर्या पृष्ठमा थप्नुहोस्।{'\n'}
                                No routine found for now — add one on the Daily Routine page.
                            </Text>
                        )}
                    </View>

                    {nextContext && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>⏭️ त्यसपछि (Coming up next)</Text>
                            <Text style={styles.sectionMeta}>{nextContext.time} · {nextContext.routine_title}</Text>
                            {renderSteps(nextContext.items)}
                        </View>
                    )}

                    <View style={styles.section}>
                        <Text style={styles.sectionLabel}>📍 यहाँ छौं (Here now)</Text>
                        {locationContext ? (
                            <>
                                <Text style={styles.sectionMeta}>
                                    {locationContext.location_label || locationContext.place_category}
                                </Text>
                                {renderSteps(locationContext.items)}
                            </>
                        ) : (
                            <Text style={styles.emptyHint}>
                                जीपीएस ब्याण्ड जडान भएपछि यो आफै देखिनेछ। अहिलेलाई तल परीक्षण गर्नुहोस्।{'\n'}
                                This fills in automatically once the GPS band is connected. Try a test location below for now.
                            </Text>
                        )}

                        <View style={styles.testLocationRow}>
                            {TEST_LOCATIONS.map((loc) => (
                                <Pressable
                                    key={loc.category}
                                    style={({ pressed }) => [
                                        styles.testLocationChip,
                                        locationContext?.place_category === loc.category && styles.testLocationChipActive,
                                        pressed && styles.pressedState,
                                    ]}
                                    onPress={() => handleSimulateLocation(loc.category)}
                                    disabled={simulating !== null}
                                >
                                    {simulating === loc.category ? (
                                        <ActivityIndicator color="#8C461F" size="small" />
                                    ) : (
                                        <>
                                            <Text style={styles.testLocationIcon}>{loc.icon}</Text>
                                            <Text style={styles.testLocationText}>{loc.label}</Text>
                                        </>
                                    )}
                                </Pressable>
                            ))}
                        </View>
                    </View>

                    {needsContext && needsContext.items.length > 0 && (
                        <View style={styles.section}>
                            <Text style={styles.sectionLabel}>💬 मलाई चाहियो (Everyday needs)</Text>
                            <Text style={styles.sectionMeta}>
                                जुनसुकै बेला भन्न थिच्नुहोस् · Tap to say it any time
                            </Text>
                            {renderNeeds(needsContext.items)}
                        </View>
                    )}

                    <Text style={styles.pictureCredit}>Pictures: Twemoji (CC-BY 4.0)</Text>
                </ScrollView>
            )}
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: '#F4EFE6' },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 24,
        paddingTop: 12,
    },
    backButton: { alignSelf: 'flex-start', paddingVertical: 10, paddingHorizontal: 14, borderRadius: 18, backgroundColor: '#E7E3D8' },
    backText: { color: '#342419', fontSize: 15, fontWeight: '700' },
    togglePill: {
        flexDirection: 'row',
        backgroundColor: '#DFD7C7',
        borderRadius: 24,
        padding: 3,
        alignItems: 'center',
    },
    toggleBtn: { paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20 },
    toggleBtnActive: { backgroundColor: '#9C532B' },
    toggleBtnText: { fontSize: 13, fontWeight: '700', color: '#6F5E52' },
    toggleBtnTextActive: { color: '#FFFFFF' },
    pressedState: { opacity: 0.85, transform: [{ scale: 0.97 }] },
    titleBlock: { paddingHorizontal: 24, marginTop: 20 },
    title: { fontSize: 26, fontWeight: '800', color: '#342419' },
    subtitle: { marginTop: 4, fontSize: 14, color: '#76675B' },
    loadingBlock: { flex: 1, alignItems: 'center', justifyContent: 'center' },
    scroll: { flex: 1, marginTop: 16 },
    scrollContent: { paddingHorizontal: 24, paddingBottom: 40, gap: 24 },
    section: {
        backgroundColor: '#FFFDF9',
        borderRadius: 22,
        padding: 16,
        borderWidth: 1,
        borderColor: '#E7DDD0',
    },
    sectionLabel: { fontSize: 15, fontWeight: '800', color: '#342419' },
    sectionMeta: { marginTop: 4, fontSize: 13, fontWeight: '600', color: '#8C461F' },
    emptyHint: { marginTop: 10, fontSize: 13, color: '#76675B', lineHeight: 19 },
    stepList: { marginTop: 12, gap: 12 },
    // The picture is the card: large and centred so a child can recognise the
    // step at a glance, with the number and speaker tucked into the corners.
    stepCard: {
        alignItems: 'center',
        backgroundColor: '#F5EFE6',
        borderRadius: 18,
        paddingTop: 16,
        paddingBottom: 14,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderColor: '#E7DDD0',
    },
    stepCardActive: { backgroundColor: '#EEF4E9', borderColor: '#C6DBC3' },
    stepIndex: {
        position: 'absolute',
        top: 10,
        left: 12,
        minWidth: 28,
        height: 28,
        borderRadius: 14,
        overflow: 'hidden',
        backgroundColor: '#FFFDF8',
        textAlign: 'center',
        lineHeight: 28,
        fontSize: 14,
        fontWeight: '800',
        color: '#8C461F',
    },
    stepPicture: {
        width: 148,
        height: 148,
        borderRadius: 24,
        backgroundColor: '#FFFDF8',
        alignItems: 'center',
        justifyContent: 'center',
    },
    stepTextBlock: { alignSelf: 'stretch', marginTop: 12, alignItems: 'center' },
    stepTitle: { fontSize: 20, fontWeight: '800', color: '#342419', textAlign: 'center' },
    stepDesc: { marginTop: 4, fontSize: 13.5, color: '#5B4E44', lineHeight: 19, textAlign: 'center' },
    stepDescEn: { marginTop: 2, fontSize: 12.5, color: '#8A786C', fontStyle: 'italic', lineHeight: 17, textAlign: 'center' },
    speakerBadge: {
        position: 'absolute',
        top: 10,
        right: 12,
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'rgba(0,0,0,0.05)',
    },
    speakerBadgeActive: { backgroundColor: 'rgba(83, 110, 80, 0.2)' },
    speakerIcon: { fontSize: 17 },
    testLocationRow: {
        marginTop: 14,
        flexDirection: 'row',
        flexWrap: 'wrap',
        gap: 8,
    },
    testLocationChip: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 14,
        backgroundColor: '#F5EFE6',
        borderWidth: 1,
        borderColor: '#E7DDD0',
        columnGap: 6,
        minWidth: 90,
        justifyContent: 'center',
    },
    testLocationChipActive: { backgroundColor: '#FCE5D7', borderColor: '#E8B98F' },
    testLocationIcon: { fontSize: 15 },
    testLocationText: { fontSize: 12.5, fontWeight: '700', color: '#4B382A' },
    needsGrid: {
        marginTop: 12,
        flexDirection: 'row',
        flexWrap: 'wrap',
        justifyContent: 'space-between',
        rowGap: 8,
    },
    needCard: {
        width: '48.5%',
        alignItems: 'center',
        backgroundColor: '#F5EFE6',
        borderRadius: 16,
        paddingVertical: 14,
        paddingHorizontal: 8,
        borderWidth: 1,
        borderColor: '#E7DDD0',
    },
    needTitle: { marginTop: 8, fontSize: 15.5, fontWeight: '800', color: '#342419', textAlign: 'center' },
    pictureCredit: { marginTop: 4, fontSize: 10.5, color: '#A39486', textAlign: 'center' },
    needSub: { marginTop: 2, fontSize: 11.5, color: '#8A786C', textAlign: 'center' },
});
