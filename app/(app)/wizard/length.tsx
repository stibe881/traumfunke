import { useState, useEffect } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    ActivityIndicator,
    Alert,
    Switch,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/context/auth';
import { useWizardStore } from '@/stores/wizard';
import type { StoryLength, Child, StoryCategory, Moral } from '@/types/supabase';
import useI18n from '@/hooks/useI18n';

const LENGTH_OPTIONS: { value: StoryLength; label: string; description: string; icon: string }[] = [
    { value: 'kurz', label: 'Kurz', description: '~5 Min. Lesezeit', icon: '🌙' },
    { value: 'normal', label: 'Normal', description: '~8 Min. Lesezeit', icon: '🌟' },
    { value: 'lang', label: 'Lang', description: '~12 Min. Lesezeit', icon: '✨' },
];

export default function WizardLengthScreen() {
    const router = useRouter();
    const { user } = useAuth();
    const { t } = useI18n();
    const {
        storyMode,
        seriesConfig,
        selectedChildIds,
        selectedCategoryId,
        selectedCategoryCharacterIds,
        selectedSideCharacterIds,
        location,
        selectedMoralId,
        length,
        setLength,
        generateImages,
        setGenerateImages,
        reset,
    } = useWizardStore();

    const [isLoading, setIsLoading] = useState(false);
    const [children, setChildren] = useState<Child[]>([]);
    const [category, setCategory] = useState<StoryCategory | null>(null);
    const [moral, setMoral] = useState<Moral | null>(null);

    useEffect(() => {
        loadSummaryData();
    }, []);

    const loadSummaryData = async () => {
        try {
            // Load selected children names
            if (selectedChildIds.length > 0) {
                const { data: childrenData } = await supabase
                    .from('children')
                    .select('*')
                    .in('id', selectedChildIds);
                if (childrenData) setChildren(childrenData);
            }

            // Load category
            if (selectedCategoryId) {
                const { data: categoryData } = await supabase
                    .from('story_categories')
                    .select('*')
                    .eq('id', selectedCategoryId)
                    .single();
                if (categoryData) setCategory(categoryData);
            }

            // Load moral
            if (selectedMoralId) {
                const { data: moralData } = await supabase
                    .from('morals')
                    .select('*')
                    .eq('id', selectedMoralId)
                    .single();
                if (moralData) setMoral(moralData);
            }
        } catch (error) {
            console.error('Error loading summary data:', error);
        }
    };

    const handleCreateStory = async () => {
        setIsLoading(true);
        try {
            // Branch based on story mode
            if (storyMode === 'series' && seriesConfig) {
                // Create a Series
                const { data, error } = await supabase.functions.invoke('create-series', {
                    body: {
                        title: seriesConfig.title || null,
                        child_ids: selectedChildIds,
                        category: category ? { id: category.id, name: category.name, slug: category.slug } : null,
                        location_text: location || null,
                        chosen_character_ids: selectedSideCharacterIds,
                        chosen_category_character_ids: selectedCategoryCharacterIds,
                        mode: seriesConfig.mode,
                        planned_episodes: seriesConfig.plannedEpisodes,
                        default_moral_key: moral?.slug || null,
                        default_length: length,
                    },
                });

                if (error) throw error;

                // Reset wizard and navigate to series detail
                reset();
                router.replace(`/(app)/series/${data.series.id}`);
            } else {
                // Create a single Story (original logic)
                const { data: request, error: requestError } = await supabase
                    .from('story_requests')
                    .insert({
                        user_id: user?.id,
                        status: 'queued',
                        category_id: selectedCategoryId,
                        location: location || null,
                        moral_id: selectedMoralId,
                        length,
                        notify_on_complete: true,
                        generate_images: generateImages,
                    })
                    .select()
                    .single();

                if (requestError) throw requestError;

                // Add children to request
                if (selectedChildIds.length > 0) {
                    await supabase.from('story_request_children').insert(
                        selectedChildIds.map((childId) => ({
                            story_request_id: request.id,
                            child_id: childId,
                        }))
                    );
                }

                // Add category characters to request
                if (selectedCategoryCharacterIds.length > 0) {
                    await supabase.from('story_request_characters').insert(
                        selectedCategoryCharacterIds.map((charId) => ({
                            story_request_id: request.id,
                            category_character_id: charId,
                        }))
                    );
                }

                // Add side characters to request
                if (selectedSideCharacterIds.length > 0) {
                    await supabase.from('story_request_characters').insert(
                        selectedSideCharacterIds.map((charId) => ({
                            story_request_id: request.id,
                            side_character_id: charId,
                        }))
                    );
                }

                // Reset wizard and navigate to generating screen
                reset();
                router.replace(`/(app)/generating/${request.id}`);
            }
        } catch (error) {
            console.error('Error creating story:', error);
            Alert.alert('Fehler', storyMode === 'series'
                ? 'Die Serie konnte nicht erstellt werden.'
                : 'Die Geschichte konnte nicht erstellt werden.');
            setIsLoading(false);
        }
    };

    return (
        <View style={styles.container}>
            {/* Progress Indicator */}
            <View style={styles.progress}>
                <View style={[styles.progressDot, styles.progressDotDone]} />
                <View style={[styles.progressLine, styles.progressLineDone]} />
                <View style={[styles.progressDot, styles.progressDotDone]} />
                <View style={[styles.progressLine, styles.progressLineDone]} />
                <View style={[styles.progressDot, styles.progressDotDone]} />
                <View style={[styles.progressLine, styles.progressLineDone]} />
                <View style={[styles.progressDot, styles.progressDotDone]} />
                <View style={[styles.progressLine, styles.progressLineDone]} />
                <View style={[styles.progressDot, styles.progressDotDone]} />
                <View style={[styles.progressLine, styles.progressLineDone]} />
                <View style={[styles.progressDot, styles.progressDotActive]} />
            </View>

            <ScrollView
                style={styles.scrollView}
                contentContainerStyle={styles.content}
                showsVerticalScrollIndicator={false}
            >
                {/* Length Selection */}
                <Text style={styles.sectionTitle}>Länge der Geschichte</Text>
                <View style={styles.lengthContainer}>
                    {LENGTH_OPTIONS.map((option) => {
                        const isSelected = length === option.value;
                        return (
                            <TouchableOpacity
                                key={option.value}
                                style={[
                                    styles.lengthCard,
                                    isSelected && styles.lengthCardSelected,
                                ]}
                                onPress={() => setLength(option.value)}
                            >
                                <Text style={styles.lengthIcon}>{option.icon}</Text>
                                <Text style={[styles.lengthLabel, isSelected && styles.lengthLabelSelected]}>
                                    {option.label}
                                </Text>
                                <Text style={styles.lengthDesc}>{option.description}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>

                {/* Image Toggle */}
                <View style={styles.imageToggleContainer}>
                    <View style={styles.imageToggleInfo}>
                        <Text style={styles.imageToggleLabel}>🖼️ Mit Bildern</Text>
                        <Text style={styles.imageToggleHint}>
                            {generateImages ? 'Bilder werden generiert (langsamer)' : 'Nur Text (schneller)'}
                        </Text>
                    </View>
                    <Switch
                        value={generateImages}
                        onValueChange={setGenerateImages}
                        trackColor={{ false: '#4C4270', true: '#7C3AED' }}
                        thumbColor={generateImages ? '#A78BFA' : '#8B7FA8'}
                    />
                </View>

                {/* Summary */}
                <Text style={styles.sectionTitle}>Zusammenfassung</Text>
                <View style={styles.summaryCard}>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Kinder:</Text>
                        <Text style={styles.summaryValue}>
                            {children.map(c => c.name).join(', ') || '-'}
                        </Text>
                    </View>
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Kategorie:</Text>
                        <Text style={styles.summaryValue}>
                            {category ? `${category.icon} ${category.name}` : '-'}
                        </Text>
                    </View>
                    {location && (
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Ort:</Text>
                            <Text style={styles.summaryValue}>{location}</Text>
                        </View>
                    )}
                    {moral && (
                        <View style={styles.summaryRow}>
                            <Text style={styles.summaryLabel}>Moral:</Text>
                            <Text style={styles.summaryValue}>{moral.text}</Text>
                        </View>
                    )}
                    <View style={styles.summaryRow}>
                        <Text style={styles.summaryLabel}>Länge:</Text>
                        <Text style={styles.summaryValue}>
                            {LENGTH_OPTIONS.find(l => l.value === length)?.label}
                        </Text>
                    </View>
                </View>
            </ScrollView>

            {/* Footer */}
            <View style={styles.footer}>
                <TouchableOpacity
                    style={[styles.createButton, isLoading && styles.createButtonDisabled]}
                    onPress={handleCreateStory}
                    disabled={isLoading}
                >
                    {isLoading ? (
                        <ActivityIndicator color="#FFFFFF" />
                    ) : (
                        <>
                            <Ionicons name="sparkles" size={22} color="#FFFFFF" />
                            <Text style={styles.createButtonText}>Geschichte erstellen</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#1A1625',
    },
    progress: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 20,
        paddingHorizontal: 24,
    },
    progressDot: {
        width: 10,
        height: 10,
        borderRadius: 5,
        backgroundColor: '#3D3255',
    },
    progressDotActive: {
        backgroundColor: '#7C3AED',
    },
    progressDotDone: {
        backgroundColor: '#22C55E',
    },
    progressLine: {
        flex: 1,
        height: 2,
        backgroundColor: '#3D3255',
        marginHorizontal: 4,
    },
    progressLineDone: {
        backgroundColor: '#22C55E',
    },
    scrollView: {
        flex: 1,
    },
    content: {
        padding: 16,
        paddingBottom: 24,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#A78BFA',
        marginBottom: 12,
    },
    lengthContainer: {
        flexDirection: 'row',
        gap: 10,
        marginBottom: 28,
    },
    lengthCard: {
        flex: 1,
        backgroundColor: '#2D2640',
        borderRadius: 14,
        padding: 16,
        alignItems: 'center',
        borderWidth: 2,
        borderColor: '#4C4270',
    },
    lengthCardSelected: {
        borderColor: '#7C3AED',
        backgroundColor: 'rgba(124, 58, 237, 0.15)',
    },
    lengthIcon: {
        fontSize: 28,
        marginBottom: 8,
    },
    lengthLabel: {
        fontSize: 15,
        fontWeight: '600',
        color: '#E9E3F5',
        marginBottom: 4,
    },
    lengthLabelSelected: {
        color: '#A78BFA',
    },
    lengthDesc: {
        fontSize: 11,
        color: '#8B7FA8',
    },
    imageToggleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        backgroundColor: '#2D2640',
        borderRadius: 14,
        padding: 16,
        marginBottom: 28,
        borderWidth: 1,
        borderColor: '#4C4270',
    },
    imageToggleInfo: {
        flex: 1,
    },
    imageToggleLabel: {
        fontSize: 16,
        fontWeight: '600',
        color: '#E9E3F5',
        marginBottom: 4,
    },
    imageToggleHint: {
        fontSize: 12,
        color: '#8B7FA8',
    },
    summaryCard: {
        backgroundColor: '#2D2640',
        borderRadius: 14,
        padding: 16,
        borderWidth: 1,
        borderColor: '#4C4270',
    },
    summaryRow: {
        flexDirection: 'row',
        marginBottom: 12,
    },
    summaryLabel: {
        width: 80,
        fontSize: 13,
        color: '#8B7FA8',
    },
    summaryValue: {
        flex: 1,
        fontSize: 13,
        color: '#F5F3FF',
        fontWeight: '500',
    },
    footer: {
        padding: 16,
        paddingBottom: 32,
        borderTopWidth: 1,
        borderTopColor: '#2D2640',
    },
    createButton: {
        backgroundColor: '#7C3AED',
        borderRadius: 14,
        padding: 18,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 10,
        shadowColor: '#7C3AED',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.4,
        shadowRadius: 12,
        elevation: 6,
    },
    createButtonDisabled: {
        opacity: 0.7,
    },
    createButtonText: {
        color: '#FFFFFF',
        fontSize: 18,
        fontWeight: '700',
    },
});
