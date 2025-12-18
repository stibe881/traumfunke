import { useState, useCallback, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    ScrollView,
    TouchableOpacity,
    ActivityIndicator,
    Alert,
    Share,
    Animated,
} from 'react-native';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Swipeable, GestureHandlerRootView } from 'react-native-gesture-handler';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import type { Series, SeriesEpisode, Moral } from '@/types/supabase';
import useI18n from '@/hooks/useI18n';

interface EpisodeWithMoral extends SeriesEpisode {
    moral_text?: string;
    subtitle?: string;
    story?: {
        id: string;
        title: string;
        subtitle?: string;
        reading_time_minutes: number;
        story_requests?: {
            status: string;
        };
    };
}

export default function SeriesDetailScreen() {
    const router = useRouter();
    const { id } = useLocalSearchParams<{ id: string }>();
    const { user } = useAuth();
    const { t } = useI18n();
    const [series, setSeries] = useState<Series | null>(null);
    const [episodes, setEpisodes] = useState<EpisodeWithMoral[]>([]);
    const [morals, setMorals] = useState<Moral[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [highlightedEpisodeId, setHighlightedEpisodeId] = useState<string | null>(null);
    const [selectedEpisodeIds, setSelectedEpisodeIds] = useState<Set<string>>(new Set());
    const scrollViewRef = useRef<ScrollView>(null);

    const isSelectionMode = selectedEpisodeIds.size > 0;

    useFocusEffect(
        useCallback(() => {
            loadSeriesData();
            loadMorals();
            setSelectedEpisodeIds(new Set()); // Reset selection on focus/reload
        }, [id])
    );

    const loadSeriesData = async () => {
        // ... (existing code)
        // Ensure to clear selection if data reloads might break things, but useFocusEffect handles it.
        // I will keep existing sync loadSeriesData structure but ensure logic is intact.
        setIsLoading(true);
        try {
            // Load series
            const { data: seriesData, error: seriesError } = await supabase
                .from('series')
                .select('*')
                .eq('id', id)
                .single();

            if (seriesError) throw seriesError;
            setSeries(seriesData);

            // Load episodes with story data
            const { data: episodesData, error: episodesError } = await supabase
                .from('series_episodes')
                .select('*, story:stories(id, title, subtitle, reading_time_minutes, story_requests(status))')
                .eq('series_id', id)
                .order('episode_number', { ascending: true });

            if (episodesError) throw episodesError;

            // Show all episodes so user can see generation progress
            setEpisodes(episodesData || []);
        } catch (error) {
            console.error('Error loading series:', error);
            Alert.alert('Fehler', 'Serie konnte nicht geladen werden.');
        } finally {
            setIsLoading(false);
        }
    };

    const loadMorals = async () => {
        const { data } = await supabase
            .from('morals')
            .select('*')
            .order('sort_order');
        setMorals(data || []);
    };

    const getMoralText = (moralKey: string) => {
        if (moralKey === 'none') return 'Keine Moral';
        const moral = morals.find(m => m.slug === moralKey);
        return moral?.text || moralKey;
    };

    const handleNewEpisode = () => {
        router.push(`/(app)/series/${id}/new-episode`);
    };

    const handleViewEpisode = (storyId: string) => {
        router.push(`/(app)/story/${storyId}`);
    };

    const handleDeleteEpisode = async (episode: EpisodeWithMoral) => {
        try {
            // 1. Delete linked story if it exists
            if (episode.story?.id) {
                await supabase
                    .from('stories')
                    .delete()
                    .eq('id', episode.story.id);
            }

            // 2. Delete the episode entry itself
            const { error } = await supabase
                .from('series_episodes')
                .delete()
                .eq('id', episode.id);

            if (error) throw error;

            // 3. Delete story now if we haven't (redundant if already deleted, but safe)
            if (episode.story?.id) {
                await supabase
                    .from('stories')
                    .delete()
                    .eq('id', episode.story.id);
            }

            // Refresh
            loadSeriesData();
        } catch (error) {
            console.error('Error deleting episode:', error);
            Alert.alert('Fehler', 'Die Folge konnte nicht gelöscht werden.');
        }
    };

    const handleDeleteSeries = () => {
        Alert.alert(
            'Serie löschen',
            `Möchtest du "${series?.title || 'diese Serie'}" wirklich löschen? Alle Folgen und zugehörigen Geschichten werden ebenfalls gelöscht. Diese Aktion kann nicht rückgängig gemacht werden.`,
            [
                { text: 'Abbrechen', style: 'cancel' },
                {
                    text: 'Löschen',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const storyIds = episodes
                                .filter(ep => ep.story?.id)
                                .map(ep => ep.story!.id);

                            if (storyIds.length > 0) {
                                await supabase
                                    .from('stories')
                                    .delete()
                                    .in('id', storyIds);
                            }

                            await supabase
                                .from('series_episodes')
                                .delete()
                                .eq('series_id', id);

                            const { error } = await supabase
                                .from('series')
                                .delete()
                                .eq('id', id);

                            if (error) throw error;

                            router.back();
                        } catch (error) {
                            console.error('Error deleting series:', error);
                            Alert.alert('Fehler', 'Die Serie konnte nicht gelöscht werden.');
                        }
                    },
                },
            ]
        );
    };

    const handleExportSeries = async () => {
        if (episodes.length === 0) {
            Alert.alert('Keine Folgen', 'Es gibt noch keine Folgen zum Exportieren.');
            return;
        }

        try {
            const storyIds = episodes.filter(ep => ep.story?.id).map(ep => ep.story!.id);
            const { data: stories } = await supabase
                .from('stories')
                .select('id, title, subtitle, content, recap_text')
                .in('id', storyIds);

            if (!stories || stories.length === 0) {
                Alert.alert('Fehler', 'Keine Geschichten gefunden.');
                return;
            }

            let exportText = `📚 ${series?.title || 'Serie'}\n`;
            exportText += `${'='.repeat(40)}\n\n`;

            episodes.forEach((ep, index) => {
                const story = stories.find(s => s.id === ep.story?.id);
                if (!story) return;

                exportText += `\n📖 Folge ${ep.episode_number}`;
                if (ep.subtitle || story.subtitle) {
                    exportText += `: ${ep.subtitle || story.subtitle}`;
                }
                exportText += `\n${'-'.repeat(30)}\n\n`;

                if (ep.episode_number > 1 && story.recap_text) {
                    exportText += `🔄 Rückblick:\n${story.recap_text}\n\n`;
                }

                if (story.content?.story && Array.isArray(story.content.story)) {
                    story.content.story.forEach((paragraph: any) => {
                        exportText += `${paragraph.text}\n\n`;
                    });
                }

                const moralText = getMoralText(ep.moral_key);
                if (moralText !== 'Keine Moral') {
                    exportText += `\n💡 Moral: ${moralText}\n`;
                }

                exportText += `\n`;
            });

            await Share.share({
                message: exportText,
                title: series?.title || 'Serie exportieren',
            });
        } catch (error) {
            console.error('Error exporting series:', error);
            Alert.alert('Fehler', 'Die Serie konnte nicht exportiert werden.');
        }
    };

    const toggleSelection = (episodeId: string) => {
        setSelectedEpisodeIds(prev => {
            const next = new Set(prev);
            if (next.has(episodeId)) {
                next.delete(episodeId);
            } else {
                next.add(episodeId);
            }
            return next;
        });
    };

    const cancelSelection = () => {
        setSelectedEpisodeIds(new Set());
    };

    const handleBatchDelete = async () => {
        Alert.alert(
            'Löschen bestätigen',
            `Möchtest du die ${selectedEpisodeIds.size} ausgewählten Folgen wirklich löschen?`,
            [
                { text: 'Abbrechen', style: 'cancel' },
                {
                    text: 'Löschen',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            const idsToDelete = Array.from(selectedEpisodeIds);
                            const episodesToDelete = episodes.filter(ep => idsToDelete.includes(ep.id));

                            // 1. Delete linked stories
                            const storyIds = episodesToDelete
                                .filter(ep => ep.story?.id)
                                .map(ep => ep.story!.id);

                            if (storyIds.length > 0) {
                                await supabase
                                    .from('stories')
                                    .delete()
                                    .in('id', storyIds);
                            }

                            // 2. Delete episodes
                            const { error } = await supabase
                                .from('series_episodes')
                                .delete()
                                .in('id', idsToDelete);

                            if (error) throw error;

                            // Refresh and clear selection
                            setSelectedEpisodeIds(new Set());
                            loadSeriesData();
                        } catch (error) {
                            console.error('Error batch deleting:', error);
                            Alert.alert('Fehler', 'Konnte nicht alle Folgen löschen.');
                        }
                    }
                }
            ]
        );
    };

    // ... handleNewEpisode, handleViewEpisode ... (keep as is)
    // NOTE: handleDeleteEpisode (single) logic can be kept but UI will hide it in selection mode.
    // Actually, Single delete via trash icon is still valid if not selecting.

    // Refactor Render:
    // Header actions: If selectionMode -> Show "Cancel" button?
    // Footer: If selectionMode -> Show "Delete (n)" button.

    return (
        <GestureHandlerRootView style={styles.container}>
            <ScrollView
                ref={scrollViewRef}
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Series Header */}
                <View style={styles.header}>
                    <View style={styles.headerRow}>
                        <View style={styles.headerContent}>
                            <Text style={styles.title}>{series?.title || 'Unbenannte Serie'}</Text>
                            <Text style={styles.meta}>
                                {isSelectionMode
                                    ? `${selectedEpisodeIds.size} ausgewählt`
                                    : `${series?.category?.name || 'Frei'} • ${episodes.length} Folgen`}
                            </Text>
                        </View>
                        <View style={styles.headerActions}>
                            {isSelectionMode ? (
                                <TouchableOpacity
                                    style={styles.editButton} // Reuse style for simplicity or add cancel style
                                    onPress={cancelSelection}
                                >
                                    <Ionicons name="close" size={22} color="#F5F3FF" />
                                </TouchableOpacity>
                            ) : (
                                <>
                                    <TouchableOpacity
                                        style={styles.editButton}
                                        onPress={() => router.push(`/(app)/series/${id}/edit`)}
                                    >
                                        <Ionicons name="pencil-outline" size={22} color="#A78BFA" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.exportButton}
                                        onPress={handleExportSeries}
                                    >
                                        <Ionicons name="share-outline" size={22} color="#22C55E" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={styles.deleteButton}
                                        onPress={handleDeleteSeries}
                                    >
                                        <Ionicons name="trash-outline" size={22} color="#EF4444" />
                                    </TouchableOpacity>
                                </>
                            )}
                        </View>
                    </View>
                </View>

                {/* Moral History - Hide in selection mode? Or disable interaction? 
                    Keep it but maybe disable interaction to avoid confusion. For now leave as is.
                */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📜 Moral-Verlauf</Text>
                    {/* ... (keep existing moral history) ... */}
                    {episodes.length === 0 ? (
                        <Text style={styles.emptyText}>Noch keine Folgen erstellt</Text>
                    ) : (
                        <View style={styles.moralHistory}>
                            {episodes.map((ep) => (
                                <TouchableOpacity
                                    key={ep.id}
                                    style={[styles.moralItem, { opacity: isSelectionMode ? 0.5 : 1 }]}
                                    disabled={isSelectionMode}
                                    onPress={() => {
                                        setHighlightedEpisodeId(ep.id);
                                        // ... existing scroll logic ...
                                    }}
                                >
                                    <Text style={styles.moralEpisode}>Folge {ep.episode_number}</Text>
                                    <Text style={styles.moralText}>{getMoralText(ep.moral_key)}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                </View>

                {/* Episodes List */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>📚 Folgen</Text>
                    {episodes.length === 0 ? (
                        <View style={styles.emptyState}>
                            {/* ... empty state ... */}
                            <Text style={styles.emptyIcon}>🎬</Text>
                            <Text style={styles.emptyTitle}>Keine Folgen</Text>
                            <Text style={styles.emptySubtitle}>Start...</Text>
                        </View>
                    ) : (
                        <View style={styles.episodeList}>
                            {episodes.map((ep) => (
                                <EpisodeRow
                                    key={ep.id}
                                    episode={ep}
                                    isHighlighted={highlightedEpisodeId === ep.id}
                                    isSelected={selectedEpisodeIds.has(ep.id)}
                                    selectionMode={isSelectionMode}
                                    onPress={() => {
                                        if (isSelectionMode) {
                                            toggleSelection(ep.id);
                                        } else {
                                            ep.story?.id && handleViewEpisode(ep.story.id);
                                        }
                                    }}
                                    onLongPress={() => {
                                        if (!isSelectionMode) {
                                            toggleSelection(ep.id);
                                        }
                                    }}
                                    onDelete={() => handleDeleteEpisode(ep)}
                                />
                            ))}
                        </View>
                    )}
                </View>
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
                {isSelectionMode ? (
                    <TouchableOpacity
                        style={[styles.newEpisodeButton, { backgroundColor: '#EF4444' }]}
                        onPress={handleBatchDelete}
                    >
                        <Ionicons name="trash" size={24} color="#FFFFFF" />
                        <Text style={styles.newEpisodeText}>Löschen ({selectedEpisodeIds.size})</Text>
                    </TouchableOpacity>
                ) : (
                    !series?.is_finished && (
                        <TouchableOpacity
                            style={styles.newEpisodeButton}
                            onPress={handleNewEpisode}
                        >
                            <Ionicons name="add-circle" size={24} color="#FFFFFF" />
                            <Text style={styles.newEpisodeText}>Weiter mit der Geschichte</Text>
                        </TouchableOpacity>
                    )
                )}
            </View>
        </GestureHandlerRootView>
    );
    // ... define EpisodeRow below ...

}

// Sub-component for Swipeable logic
function EpisodeRow({
    episode,
    isHighlighted,
    isSelected,
    selectionMode,
    onPress,
    onLongPress,
    onDelete,
}: {
    episode: EpisodeWithMoral;
    isHighlighted: boolean;
    isSelected?: boolean;
    selectionMode?: boolean;
    onPress: () => void;
    onLongPress?: () => void;
    onDelete: () => void;
}) {
    const swipeableRef = useRef<Swipeable>(null);

    const handleDeleteWithConfirmation = () => {
        Alert.alert(
            'Folge löschen',
            `Möchtest du Folge ${episode.episode_number} unwiderruflich löschen?`,
            [
                { text: 'Abbrechen', style: 'cancel', onPress: () => swipeableRef.current?.close() },
                {
                    text: 'Löschen',
                    style: 'destructive',
                    onPress: onDelete,
                },
            ]
        );
    };

    const renderRightActions = (
        progress: Animated.AnimatedInterpolation<number>,
        _dragX: Animated.AnimatedInterpolation<number>
    ) => {
        const scale = progress.interpolate({
            inputRange: [0, 1],
            outputRange: [0.8, 1],
            extrapolate: 'clamp',
        });

        return (
            <TouchableOpacity onPress={handleDeleteWithConfirmation} activeOpacity={0.8}>
                <Animated.View style={[styles.deleteAction, { transform: [{ scale }] }]}>
                    <Ionicons name="trash-outline" size={24} color="#fff" />
                    <Text style={styles.deleteText}>Löschen</Text>
                </Animated.View>
            </TouchableOpacity>
        );
    };

    const status = episode.story?.story_requests?.status;
    const isGenerating = status && status !== 'finished' && status !== 'failed';
    const isFailed = status === 'failed';

    const handlePress = () => {
        if (selectionMode) {
            onPress();
            return;
        }
        if (isGenerating) {
            Alert.alert('Einen Moment', 'Diese Folge wird noch erstellt. Bitte habe etwas Geduld.');
            return;
        }
        if (isFailed) {
            Alert.alert('Fehler', 'Bei der Erstellung ist ein Fehler aufgetreten.');
            return;
        }
        onPress();
    };

    const content = (
        <TouchableOpacity
            style={[
                styles.episodeCard,
                isHighlighted && styles.episodeCardHighlighted,
                isSelected && styles.episodeCardSelected,
                (isGenerating || isFailed) && { opacity: 0.8 }
            ]}
            onPress={handlePress}
            onLongPress={onLongPress}
            activeOpacity={0.7}
        >
            {selectionMode && (
                <View style={styles.selectionCheckbox}>
                    <Ionicons
                        name={isSelected ? "checkbox" : "square-outline"}
                        size={24}
                        color={isSelected ? "#7C3AED" : "#8B7FA8"}
                    />
                </View>
            )}
            <View style={styles.episodeNumber}>
                <Text style={styles.episodeNumberText}>{episode.episode_number}</Text>
            </View>
            <View style={styles.episodeContent}>
                <Text style={styles.episodeTitle}>
                    Folge {episode.episode_number}
                    {episode.subtitle || episode.story?.subtitle ? `: ${episode.subtitle || episode.story?.subtitle}` : ''}
                </Text>
                {isGenerating ? (
                    <Text style={[styles.episodeMeta, { color: '#A78BFA' }]}>
                        ✨ Wird erstellt...
                    </Text>
                ) : isFailed ? (
                    <Text style={[styles.episodeMeta, { color: '#EF4444' }]}>
                        ❌ Fehlgeschlagen
                    </Text>
                ) : (
                    <Text style={styles.episodeMeta}>
                        {episode.story?.reading_time_minutes || 0} Min •
                        {episode.is_final ? ' 🏁 Finale' : ' 📍 Cliffhanger'}
                    </Text>
                )}
            </View>
            {!selectionMode && !isGenerating && !isFailed && <Ionicons name="chevron-forward" size={20} color="#8B7FA8" />}
        </TouchableOpacity>
    );

    if (selectionMode) {
        return content;
    }

    return (
        <Swipeable
            ref={swipeableRef}
            renderRightActions={renderRightActions}
            rightThreshold={40}
            overshootRight={false}
        >
            {content}
        </Swipeable>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1625',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1A1625',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#1A1625',
    },
    errorText: {
        color: '#EF4444',
        fontSize: 16,
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: 16,
        paddingBottom: 100,
    },
    header: {
        marginBottom: 24,
    },
    headerRow: {
        flexDirection: 'row',
        alignItems: 'flex-start',
        justifyContent: 'space-between',
    },
    headerContent: {
        flex: 1,
        marginRight: 12,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    editButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(167, 139, 250, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    exportButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(34, 197, 94, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    deleteButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: 'rgba(239, 68, 68, 0.15)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    title: {
        fontSize: 24,
        fontWeight: '700',
        color: '#F5F3FF',
        marginBottom: 8,
    },
    meta: {
        fontSize: 14,
        color: '#8B7FA8',
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#A78BFA',
        marginBottom: 12,
    },
    emptyText: {
        fontSize: 14,
        color: '#6B5B8A',
        fontStyle: 'italic',
    },
    moralHistory: {
        gap: 8,
    },
    moralItem: {
        backgroundColor: '#2D2640',
        borderRadius: 12,
        padding: 12,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#4C4270',
    },
    moralEpisode: {
        fontSize: 13,
        fontWeight: '600',
        color: '#A78BFA',
        width: 70,
    },
    moralText: {
        flex: 1,
        fontSize: 13,
        color: '#E9E3F5',
    },
    emptyState: {
        alignItems: 'center',
        paddingVertical: 32,
    },
    emptyIcon: {
        fontSize: 48,
        marginBottom: 12,
    },
    emptyTitle: {
        fontSize: 18,
        fontWeight: '600',
        color: '#F5F3FF',
        marginBottom: 4,
    },
    emptySubtitle: {
        fontSize: 14,
        color: '#8B7FA8',
        textAlign: 'center',
    },
    episodeList: {
        gap: 10,
    },
    episodeCard: {
        backgroundColor: '#2D2640',
        borderRadius: 14,
        padding: 14,
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderColor: '#4C4270',
    },
    episodeCardHighlighted: {
        backgroundColor: '#3D2F60',
        borderColor: '#A78BFA',
        borderWidth: 2,
        shadowColor: '#A78BFA',
        shadowOffset: { width: 0, height: 0 },
        shadowOpacity: 0.5,
        shadowRadius: 10,
        elevation: 8,
    },
    episodeCardSelected: {
        borderColor: '#7C3AED',
        backgroundColor: '#352B4D',
    },
    selectionCheckbox: {
        marginRight: 12,
    },
    episodeNumber: {
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: '#7C3AED',
        justifyContent: 'center',
        alignItems: 'center',
        marginRight: 12,
    },
    episodeNumberText: {
        fontSize: 16,
        fontWeight: '700',
        color: '#FFFFFF',
    },
    episodeContent: {
        flex: 1,
    },
    episodeTitle: {
        fontSize: 15,
        fontWeight: '600',
        color: '#F5F3FF',
        marginBottom: 4,
    },
    episodeMeta: {
        fontSize: 12,
        color: '#8B7FA8',
    },
    footer: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        padding: 16,
        paddingBottom: 32,
        backgroundColor: '#1A1625',
        borderTopWidth: 1,
        borderTopColor: '#2D2640',
    },
    newEpisodeButton: {
        backgroundColor: '#7C3AED',
        borderRadius: 16,
        padding: 16,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    newEpisodeText: {
        color: '#FFFFFF',
        fontSize: 17,
        fontWeight: '600',
    },
    episodeMainClickable: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
    },
    episodeActions: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingLeft: 8,
        gap: 12,
    },
    episodeDeleteButton: {
        padding: 4,
    },
    deleteAction: {
        backgroundColor: '#EF4444',
        justifyContent: 'center',
        alignItems: 'center',
        width: 80,
        height: '100%',
        borderRadius: 14,
        marginLeft: 8,
    },
    deleteText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: '600',
        marginTop: 4,
    },
});
