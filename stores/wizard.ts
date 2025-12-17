import { create } from 'zustand';
import type { Child, StoryCategory, Moral, CategoryCharacter, SideCharacter, StoryLength, SeriesMode } from '@/types/supabase';

interface SeriesConfig {
    mode: SeriesMode;
    plannedEpisodes?: number;
    title?: string;
}

interface WizardState {
    // Story Mode
    storyMode: 'single' | 'series';
    seriesConfig: SeriesConfig | null;

    // Step 1: Children Selection
    selectedChildIds: string[];

    // Step 2: Category
    selectedCategoryId: string | null;

    // Step 3: Characters
    selectedCategoryCharacterIds: string[];
    selectedSideCharacterIds: string[];

    // Step 4: Location
    location: string;

    // Step 5: Moral
    selectedMoralId: string | null;

    // Step 6: Length
    length: StoryLength;

    // Step 6b: Images toggle
    generateImages: boolean;

    // Actions
    setStoryMode: (mode: 'single' | 'series') => void;
    setSeriesConfig: (config: SeriesConfig | null) => void;
    setSelectedChildren: (ids: string[]) => void;
    toggleChild: (id: string) => void;
    setCategory: (id: string | null) => void;
    toggleCategoryCharacter: (id: string) => void;
    toggleSideCharacter: (id: string) => void;
    setLocation: (location: string) => void;
    setMoral: (id: string | null) => void;
    setLength: (length: StoryLength) => void;
    setGenerateImages: (value: boolean) => void;
    reset: () => void;
}

const initialState = {
    storyMode: 'single' as 'single' | 'series',
    seriesConfig: null as SeriesConfig | null,
    selectedChildIds: [],
    selectedCategoryId: null,
    selectedCategoryCharacterIds: [],
    selectedSideCharacterIds: [],
    location: '',
    selectedMoralId: null,
    length: 'normal' as StoryLength,
    generateImages: true,
};

export const useWizardStore = create<WizardState>((set) => ({
    ...initialState,

    setStoryMode: (mode) => set({ storyMode: mode }),

    setSeriesConfig: (config) => set({ seriesConfig: config }),

    setSelectedChildren: (ids) => set({ selectedChildIds: ids }),

    toggleChild: (id) => set((state) => ({
        selectedChildIds: state.selectedChildIds.includes(id)
            ? state.selectedChildIds.filter((i) => i !== id)
            : [...state.selectedChildIds, id],
    })),

    setCategory: (id) => set({
        selectedCategoryId: id,
        // Reset characters when category changes
        selectedCategoryCharacterIds: [],
    }),

    toggleCategoryCharacter: (id) => set((state) => ({
        selectedCategoryCharacterIds: state.selectedCategoryCharacterIds.includes(id)
            ? state.selectedCategoryCharacterIds.filter((i) => i !== id)
            : [...state.selectedCategoryCharacterIds, id],
    })),

    toggleSideCharacter: (id) => set((state) => ({
        selectedSideCharacterIds: state.selectedSideCharacterIds.includes(id)
            ? state.selectedSideCharacterIds.filter((i) => i !== id)
            : [...state.selectedSideCharacterIds, id],
    })),

    setLocation: (location) => set({ location }),

    setMoral: (id) => set({ selectedMoralId: id }),

    setLength: (length) => set({ length }),

    setGenerateImages: (value) => set({ generateImages: value }),

    reset: () => set(initialState),
}));

