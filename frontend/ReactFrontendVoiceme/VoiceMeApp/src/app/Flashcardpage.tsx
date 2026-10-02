import React, { useEffect, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  SafeAreaView,
  StatusBar,
  ScrollView,
  Pressable,
  useWindowDimensions,
  Platform,
} from 'react-native';
import Svg, { Path, Rect, Circle, Ellipse } from 'react-native-svg';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import { router } from 'expo-router';
import { API_BASE_URL } from '@/constants/api';



type Language = 'ne' | 'en';

interface Flashcard {
  id: string;
  wordNe: string;
  transliterationNe: string;
  wordEn: string;
  bgColor: string;
  accentColor: string;
  illustrationType: 'food' | 'water' | 'toilet' | 'help' | 'brush' | 'play' | 'medicine';
}

const FLASHCARDS: Flashcard[] = [
  {
    id: 'food',
    wordNe: 'खाना',
    transliterationNe: 'Khāna',
    wordEn: 'Food',
    bgColor: '#FADCD1', // Soft peach
    accentColor: '#8C461F',
    illustrationType: 'food',
  },
  {
    id: 'water',
    wordNe: 'पानी',
    transliterationNe: 'Pānī',
    wordEn: 'Water',
    bgColor: '#D9ECCA', // Soft mint green
    accentColor: '#2E613B',
    illustrationType: 'water',
  },
  {
    id: 'toilet',
    wordNe: 'शौचालय',
    transliterationNe: 'Shauchālaya',
    wordEn: 'Toilet',
    bgColor: '#E5DDD4', // Warm grey
    accentColor: '#3F5B4E',
    illustrationType: 'toilet',
  },
  {
    id: 'help',
    wordNe: 'सहयोग',
    transliterationNe: 'Sahayog',
    wordEn: 'Help me',
    bgColor: '#FAF0E3', // Soft warm cream
    accentColor: '#C26E36',
    illustrationType: 'help',
  },
  {
    id: 'brush',
    wordNe: 'ब्रश',
    transliterationNe: 'Brash',
    wordEn: 'Brush',
    bgColor: '#E0F2DC', // Soft pale mint
    accentColor: '#8A4118',
    illustrationType: 'brush',
  },
  {
    id: 'play',
    wordNe: 'खेल',
    transliterationNe: 'Khel',
    wordEn: 'Play',
    bgColor: '#EDE3D5', // Soft biscuit cream
    accentColor: '#A7521F',
    illustrationType: 'play',
  },
  {
    id: 'medicine',
    wordNe: 'औषधि',
    transliterationNe: 'Aushadhi',
    wordEn: 'Medicine',
    bgColor: '#FDEAE8', // Soft warm rose/coral
    accentColor: '#B33928',
    illustrationType: 'medicine',
  },
];

// Vector SVG Illustrations matching screenshot aesthetic
const CardIllustration: React.FC<{ type: string; accentColor: string }> = ({ type, accentColor }) => {
  switch (type) {
    case 'food':
      return (
        <Svg width={74} height={56} viewBox="0 0 100 80">
          {/* Steam */}
          <Path d="M40 20 C36 16, 40 12, 37 8" stroke={accentColor} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.5} />
          <Path d="M52 18 C48 14, 52 10, 49 6" stroke={accentColor} strokeWidth={2} strokeLinecap="round" fill="none" opacity={0.5} />
          {/* Bowl */}
          <Ellipse cx={50} cy={52} rx={34} ry={13} stroke={accentColor} strokeWidth={3} fill="#FFFDF8" />
          <Path d="M18 48 C18 32, 82 32, 82 48 L78 54 C78 40, 22 40, 22 54 Z" fill="#FFFDF8" stroke={accentColor} strokeWidth={3} strokeLinejoin="round" />
          {/* Rice/curry mound */}
          <Ellipse cx={50} cy={41} rx={22} ry={9} fill="#EDD9A3" stroke={accentColor} strokeWidth={1.5} />
          <Circle cx={42} cy={39} r={3.2} fill="#C0472B" />
          <Circle cx={56} cy={38} r={2.6} fill="#588157" />
          {/* Spoon resting on the rim */}
          <Ellipse cx={76} cy={44} rx={4} ry={6} fill="#DCD3C0" stroke={accentColor} strokeWidth={1.5} transform="rotate(20 76 44)" />
          <Rect x={75} y={48} width={3} height={14} rx={1.5} fill="#DCD3C0" stroke={accentColor} strokeWidth={1} transform="rotate(20 76 44)" />
        </Svg>
      );
    case 'water':
      return (
        <Svg width={74} height={56} viewBox="0 0 100 80">
          {/* Glass */}
          <Path d="M30 14 L46 66 L60 66 L74 14 Z" fill="#F4FAF0" stroke={accentColor} strokeWidth={3} strokeLinejoin="round" />
          {/* Water fill */}
          <Path d="M35 32 L46 63 L60 63 L69 32 Z" fill="#8FC7E8" opacity={0.85} />
          {/* Surface ripple */}
          <Path d="M36 32 C42 29, 48 35, 54 32 C60 29, 64 33, 68 32" stroke="#FFFFFF" strokeWidth={1.6} fill="none" opacity={0.8} />
          {/* Droplet beside the glass */}
          <Path d="M22 24 C22 30, 15 32, 15 38 C15 42.5, 18.5 45, 22 45 C25.5 45, 29 42.5, 29 38 C29 32, 22 30, 22 24 Z" fill="#5B9BD5" stroke={accentColor} strokeWidth={1.5} />
          <Ellipse cx={19.5} cy={37} rx={2} ry={3} fill="#FFFFFF" opacity={0.55} />
        </Svg>
      );
    case 'toilet':
      return (
        <Svg width={74} height={56} viewBox="0 0 100 80">
          <Rect x={36} y={12} width={28} height={22} rx={5} fill="#F4EFE6" stroke="#635B4F" strokeWidth={2.5} />
          <Rect x={58} y={17} width={7} height={5} rx={2} fill="#635B4F" />
          <Rect x={46} y={34} width={8} height={10} fill="#F4EFE6" stroke="#635B4F" strokeWidth={2} />
          <Ellipse cx={50} cy={54} rx={26} ry={12} fill="#FFFDF9" stroke="#3F584C" strokeWidth={3} />
          <Ellipse cx={50} cy={53} rx={19} ry={7.5} fill="none" stroke="#3F584C" strokeWidth={2} opacity={0.55} />
        </Svg>
      );
    case 'help':
      return (
        <Svg width={74} height={56} viewBox="0 0 100 80">
          {/* Raised open hand */}
          <Rect x={38} y={40} width={22} height={24} rx={10} fill={accentColor} />
          <Rect x={30} y={38} width={9} height={20} rx={4.5} fill={accentColor} transform="rotate(-18 34.5 48)" />
          <Rect x={36} y={16} width={8} height={28} rx={4} fill={accentColor} />
          <Rect x={45} y={12} width={8} height={32} rx={4} fill={accentColor} />
          <Rect x={54} y={14} width={8} height={30} rx={4} fill={accentColor} />
          <Rect x={63} y={20} width={8} height={26} rx={4} fill={accentColor} />
          {/* Small heart to signal "asking for help/support" */}
          <Path d="M50 62 C47 58, 40 58, 40 64 C40 69, 50 74, 50 74 C50 74, 60 69, 60 64 C60 58, 53 58, 50 62 Z" fill="#FFFDF8" stroke={accentColor} strokeWidth={2} />
        </Svg>
      );
    case 'brush':
      return (
        <Svg width={74} height={56} viewBox="0 0 100 80">
          {/* Handle */}
          <Rect x={35} y={26} width={10} height={48} rx={5} fill={accentColor} transform="rotate(-38 40 50)" />
          {/* Brush head */}
          <Rect x={30} y={12} width={24} height={16} rx={5} fill="#F5E8C8" stroke="#D6C49D" strokeWidth={2} transform="rotate(-38 42 20)" />
          {/* Bristle lines */}
          <Path d="M26 14 L21 8 M33 10 L29 3 M40 8 L38 1" stroke="#B79F72" strokeWidth={1.8} strokeLinecap="round" transform="rotate(-38 42 20) translate(0 0)" />
          {/* Toothpaste squiggle */}
          <Path d="M62 20 C66 18, 66 24, 70 22 C73 20.5, 74 24, 77 23" stroke="#7FB6E0" strokeWidth={3} strokeLinecap="round" fill="none" />
        </Svg>
      );
    case 'play':
      return (
        <Svg width={74} height={56} viewBox="0 0 100 80">
          {/* Ball */}
          <Circle cx={30} cy={30} r={15} fill="#FFFDF8" stroke={accentColor} strokeWidth={2.5} />
          <Path d="M20 24 C26 30, 34 30, 40 24 M30 15 L30 45 M22 34 C26 30, 34 30, 38 34" stroke={accentColor} strokeWidth={1.6} fill="none" opacity={0.7} />
          {/* Building blocks */}
          <Rect x={48} y={38} width={16} height={16} rx={3} fill={accentColor} transform="rotate(-6 56 46)" />
          <Rect x={64} y={44} width={16} height={16} rx={3} fill="#E8B84B" transform="rotate(8 72 52)" />
          <Rect x={54} y={22} width={14} height={14} rx={3} fill="#7FA6E0" transform="rotate(12 61 29)" />
        </Svg>
      );
    case 'medicine':
      return (
        <Svg width={74} height={56} viewBox="0 0 100 80">
          {/* Capsule pill */}
          <Rect
            x={30}
            y={24}
            width={40}
            height={20}
            rx={10}
            fill="#E56B55"
            stroke={accentColor}
            strokeWidth={2.5}
            transform="rotate(-25 50 34)"
          />
          {/* White half cap */}
          <Path
            d="M31 28 L49 20 L58 37 L40 45 Z"
            fill="#FFFDF9"
          />
          {/* Medical cross */}
          <Rect x={47} y={27} width={6} height={14} rx={2} fill="#E56B55" />
          <Rect x={43} y={31} width={14} height={6} rx={2} fill="#E56B55" />
        </Svg>
      );
    default:
      return (
        <Svg width={74} height={56} viewBox="0 0 100 80">
          <Circle cx={50} cy={40} r={22} fill="#EAE5DC" />
        </Svg>
      );
  }
};

export default function App() {
  // Read live so the grid re-fits when a browser window is resized or a phone rotates.
  const { width } = useWindowDimensions();
  const cardWidth = (width - 32 - 12) / 2; // 2 columns with 16px screen padding and 12px gap
  const [lang, setLang] = useState<Language>('ne');
  const [selectedCard, setSelectedCard] = useState<Flashcard>(FLASHCARDS[0]); // Default to Food / खाना
  const [speakingLanguage, setSpeakingLanguage] = useState<Language | null>(null);

  // A single player instance is reused for every card/language. While it's
  // actively playing, isPlayingRef blocks every new tap outright — taps
  // can't interrupt, restart, or otherwise hamper audio that's already
  // playing, no matter how many times or how fast they land. Once playback
  // genuinely finishes, the block lifts and the next tap starts clean.
  const player = useAudioPlayer(null);
  const playerStatus = useAudioPlayerStatus(player);
  const playRequestId = useRef(0);
  const lastPlaybackRef = useRef<{ requestId: number; card: Flashcard; lang: Language } | null>(null);
  const isPlayingRef = useRef(false);
  // Cards that have already had their one-time Nepali -> English intro. After
  // that, a tap plays exactly the language tapped and nothing else chains.
  const introPlayedRef = useRef<Set<string>>(new Set());

  // Backend-generated speech for either Nepali or English
  const speakCard = async (card: Flashcard, targetLang: Language) => {
    if (isPlayingRef.current) {
      // Already playing something — ignore the tap rather than disturb it.
      return;
    }

    try {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } catch {}

    const thisRequest = ++playRequestId.current;
    isPlayingRef.current = true;
    setSpeakingLanguage(targetLang);

    try {
      player.pause();
      player.replace(`${API_BASE_URL}/api/tts/flashcard/${card.id}/${targetLang}/`);

      // Force a restart even when it's the exact same source as last time
      // (same card, same language tapped again after finishing) so it
      // always replays from the beginning instead of silently no-op'ing.
      await player.seekTo(0);
      lastPlaybackRef.current = { requestId: thisRequest, card, lang: targetLang };
      player.play();
    } catch (e) {
      console.warn(e);
      isPlayingRef.current = false;
      setSpeakingLanguage(null);
    }
  };

  useEffect(() => {
    if (!playerStatus.didJustFinish) return;

    isPlayingRef.current = false;
    setSpeakingLanguage(null);

    // Chain straight into English right after Nepali finishes, but only the
    // very first time a given card is played. After that one-time intro,
    // each card is its own thing: a tap plays only the language tapped.
    const finished = lastPlaybackRef.current;
    if (
      finished &&
      finished.requestId === playRequestId.current &&
      finished.lang === 'ne' &&
      !introPlayedRef.current.has(finished.card.id)
    ) {
      introPlayedRef.current.add(finished.card.id);
      speakCard(finished.card, 'en');
    }
  }, [playerStatus.didJustFinish]);

  // When a card box is clicked
  const handleCardPress = (card: Flashcard) => {
    setSelectedCard(card);
    speakCard(card, lang); // Speaks in current active language
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar
        barStyle="dark-content"
        backgroundColor="#F4EFE6"
        translucent={Platform.OS === 'android'}
      />

      {/* Top Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityLabel="Return to home"
          accessibilityRole="button"
          onPress={() => router.back()}
          style={styles.backButton}
        >
          <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
            <Path
              d="M15 18L9 12L15 6"
              stroke="#342419"
              strokeWidth={2.4}
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </Svg>
        </Pressable>
        <View>
          <Text style={styles.title}>
            {lang === 'ne' ? 'फ्लैशकार्ड' : 'Flashcards'}
          </Text>
          <Text style={styles.subtitle}>tap a card to hear it</Text>
        </View>

        {/* Bilingual Switcher (ने / EN) */}
        <View style={styles.togglePill}>
          <Pressable
            onPress={() => {
              setLang('ne');
              try { Haptics.selectionAsync(); } catch {}
            }}
            style={[styles.toggleBtn, lang === 'ne' && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleBtnText, lang === 'ne' && styles.toggleBtnTextActive]}>
              ने
            </Text>
          </Pressable>

          <Pressable
            onPress={() => {
              setLang('en');
              try { Haptics.selectionAsync(); } catch {}
            }}
            style={[styles.toggleBtn, lang === 'en' && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleBtnText, lang === 'en' && styles.toggleBtnTextActive]}>
              EN
            </Text>
          </Pressable>
        </View>
      </View>

      {/* 2-Column Scrollable Grid */}
      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.grid}>
          {FLASHCARDS.map((card) => {
            const isSelected = selectedCard.id === card.id;
            const isSpeakingThisCard = isSelected && speakingLanguage !== null;

            return (
              <Pressable
                key={card.id}
                onPress={() => handleCardPress(card)}
                style={[
                  styles.card,
                  { width: cardWidth, backgroundColor: card.bgColor },
                  isSelected && styles.cardSelected,
                ]}
              >
                {/* Background ambient circles */}
                <View style={[styles.blob, styles.blobTopLeft]} />
                <View style={[styles.blob, styles.blobBottomRight]} />

                {/* Illustration */}
                <View style={styles.illustrationWrapper}>
                  <CardIllustration type={card.illustrationType} accentColor={card.accentColor} />
                </View>

                {/* Card labels */}
                <View style={styles.labelWrapper}>
                  <Text style={styles.primaryWord}>
                    {lang === 'ne' ? card.wordNe : card.wordEn}
                  </Text>
                  <Text style={styles.secondaryWord}>
                    {lang === 'ne' ? card.wordEn : card.transliterationNe}
                  </Text>
                </View>

                {/* Speaker icon in bottom right */}
                <View style={[styles.speakerBadge, isSpeakingThisCard && styles.speakerBadgeActive]}>
                  <Svg width={14} height={14} viewBox="0 0 24 24" fill="none">
                    <Path
                      d="M11 5L6 9H2V15H6L11 19V5Z"
                      stroke={isSpeakingThisCard ? '#536E50' : '#4E3E33'}
                      strokeWidth={2}
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill={isSpeakingThisCard ? '#536E50' : 'none'}
                    />
                    <Path
                      d="M15.54 8.46C16.48 9.4 17 10.68 17 12C17 13.32 16.48 14.6 15.54 15.54"
                      stroke={isSpeakingThisCard ? '#536E50' : '#4E3E33'}
                      strokeWidth={2}
                      strokeLinecap="round"
                    />
                  </Svg>
                </View>
              </Pressable>
            );
          })}
        </View>
      </ScrollView>

      {/* Persistent Bottom Speech Bar with Both English & Nepali Word Buttons */}
      <View style={styles.bottomBar}>
        <View style={styles.bottomCard}>
          {/* Header indicator */}
          <View style={styles.bottomBarHeader}>
            <View style={styles.activeIndicatorRow}>
              <View style={styles.greenDot} />
              <Text style={styles.activeCardText}>
                {selectedCard.wordEn} · {selectedCard.wordNe}
              </Text>
            </View>
            <Text style={styles.tapPromptText}>Tap word to speak:</Text>
          </View>

          {/* Dual Language Buttons */}
          <View style={styles.buttonRow}>
            {/* Nepali Speech Button */}
            <Pressable
              onPress={() => speakCard(selectedCard, 'ne')}
              style={({ pressed }) => [
                styles.speechButton,
                speakingLanguage === 'ne' && styles.speechButtonActive,
                pressed && styles.buttonPressed,
              ]}
            >
              <View>
                <Text
                  style={[
                    styles.buttonLanguageLabel,
                    speakingLanguage === 'ne' && styles.buttonLanguageLabelActive,
                  ]}
                >
                  🇳🇵 नेपाली
                </Text>
                <Text
                  style={[
                    styles.buttonWordNe,
                    speakingLanguage === 'ne' && styles.buttonWordActive,
                  ]}
                >
                  {selectedCard.wordNe}
                </Text>
              </View>

              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M11 5L6 9H2V15H6L11 19V5Z"
                  stroke={speakingLanguage === 'ne' ? '#FFFFFF' : '#536E50'}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill={speakingLanguage === 'ne' ? '#FFFFFF' : '#536E50'}
                />
                <Path
                  d="M15.54 8.46C16.48 9.4 17 10.68 17 12C17 13.32 16.48 14.6 15.54 15.54"
                  stroke={speakingLanguage === 'ne' ? '#FFFFFF' : '#536E50'}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
            </Pressable>

            {/* English Speech Button */}
            <Pressable
              onPress={() => speakCard(selectedCard, 'en')}
              style={({ pressed }) => [
                styles.speechButton,
                speakingLanguage === 'en' && styles.speechButtonActive,
                pressed && styles.buttonPressed,
              ]}
            >
              <View>
                <Text
                  style={[
                    styles.buttonLanguageLabel,
                    speakingLanguage === 'en' && styles.buttonLanguageLabelActive,
                  ]}
                >
                  🇬🇧 English
                </Text>
                <Text
                  style={[
                    styles.buttonWordEn,
                    speakingLanguage === 'en' && styles.buttonWordActive,
                  ]}
                >
                  {selectedCard.wordEn}
                </Text>
              </View>

              <Svg width={20} height={20} viewBox="0 0 24 24" fill="none">
                <Path
                  d="M11 5L6 9H2V15H6L11 19V5Z"
                  stroke={speakingLanguage === 'en' ? '#FFFFFF' : '#536E50'}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  fill={speakingLanguage === 'en' ? '#FFFFFF' : '#536E50'}
                />
                <Path
                  d="M15.54 8.46C16.48 9.4 17 10.68 17 12C17 13.32 16.48 14.6 15.54 15.54"
                  stroke={speakingLanguage === 'en' ? '#FFFFFF' : '#536E50'}
                  strokeWidth={2}
                  strokeLinecap="round"
                />
              </Svg>
            </Pressable>
          </View>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4EFE6', // Warm oatmeal
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#EAE2D5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: '800',
    color: '#342419',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 13.5,
    color: '#76675B',
    marginTop: 2,
  },
  togglePill: {
    flexDirection: 'row',
    backgroundColor: '#DFD7C7',
    borderRadius: 24,
    padding: 3,
    alignItems: 'center',
  },
  toggleBtn: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 20,
  },
  toggleBtnActive: {
    backgroundColor: '#9C532B',
  },
  toggleBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#6F5E52',
  },
  toggleBtnTextActive: {
    color: '#FFFFFF',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 14,
  },
  card: {
    height: 172,
    borderRadius: 26,
    padding: 14,
    justifyContent: 'space-between',
    overflow: 'hidden',
    position: 'relative',
    borderWidth: 1.5,
    borderColor: 'rgba(0,0,0,0.04)',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1.5 },
        shadowOpacity: 0.05,
        shadowRadius: 5,
      },
      android: {
        elevation: 1.5,
      },
    }),
  },
  cardSelected: {
    borderColor: '#536E50',
    borderWidth: 2.5,
    transform: [{ scale: 0.99 }],
  },
  blob: {
    position: 'absolute',
    borderRadius: 60,
    backgroundColor: 'rgba(215, 217, 206, 0.45)',
  },
  blobTopLeft: {
    width: 48,
    height: 48,
    top: -6,
    left: -6,
  },
  blobBottomRight: {
    width: 58,
    height: 58,
    bottom: 14,
    right: -10,
  },
  illustrationWrapper: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  labelWrapper: {
    marginTop: 'auto',
  },
  primaryWord: {
    fontSize: 21,
    fontWeight: '800',
    color: '#342419',
    letterSpacing: -0.3,
  },
  secondaryWord: {
    fontSize: 12.5,
    color: '#76675B',
    marginTop: 2,
    fontWeight: '600',
  },
  speakerBadge: {
    position: 'absolute',
    bottom: 12,
    right: 12,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.05)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  speakerBadgeActive: {
    backgroundColor: 'rgba(83, 110, 80, 0.2)',
  },
  bottomBar: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 12 : 16,
    paddingTop: 8,
    backgroundColor: '#F4EFE6',
    borderTopWidth: 1,
    borderTopColor: '#E5DDD0',
  },
  bottomCard: {
    backgroundColor: '#E2D3B7',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: '#D4C3A6',
  },
  bottomBarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(212, 195, 166, 0.6)',
    marginBottom: 10,
  },
  activeIndicatorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    columnGap: 6,
  },
  greenDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#536E50',
  },
  activeCardText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#4A3728',
    textTransform: 'uppercase',
  },
  tapPromptText: {
    fontSize: 11,
    color: '#6E5C4E',
    fontWeight: '600',
  },
  buttonRow: {
    flexDirection: 'row',
    columnGap: 10,
  },
  speechButton: {
    flex: 1,
    backgroundColor: '#FDF9F3',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#D6C5A9',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.04,
        shadowRadius: 3,
      },
      android: {
        elevation: 1,
      },
    }),
  },
  speechButtonActive: {
    backgroundColor: '#536E50',
    borderColor: '#3D543B',
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  buttonLanguageLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#8C461F',
    textTransform: 'uppercase',
    marginBottom: 2,
  },
  buttonLanguageLabelActive: {
    color: '#DDEED9',
  },
  buttonWordNe: {
    fontSize: 18,
    fontWeight: '800',
    color: '#342419',
  },
  buttonWordEn: {
    fontSize: 17,
    fontWeight: '800',
    color: '#342419',
  },
  buttonWordActive: {
    color: '#FFFFFF',
  },
});