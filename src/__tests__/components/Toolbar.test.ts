import { describe, it, expect, vi } from 'vitest';
import { mount } from '@vue/test-utils';
import { ref } from 'vue';
import Toolbar from '../../components/Toolbar.vue';

// Mock markdown converter
vi.mock('../../utils/markdown-converter', () => ({
  htmlToMarkdown: vi.fn(() => 'mock markdown content'),
}));

// Mock editor for injection
const createMockEditor = (options: {
  isActive?: (name: string, attrs?: Record<string, unknown>) => boolean;
  canUndo?: boolean;
  canRedo?: boolean;
  characterCount?: number;
  wordCount?: number;
} = {}) => {
  const {
    isActive = () => false,
    canUndo = true,
    canRedo = true,
    characterCount = 100,
    wordCount = 20,
  } = options;

  return ref({
    isActive,
    can: () => ({
      undo: () => canUndo,
      redo: () => canRedo,
    }),
    chain: () => ({
      focus: () => ({
        undo: () => ({ run: vi.fn() }),
        redo: () => ({ run: vi.fn() }),
        toggleBold: () => ({ run: vi.fn() }),
        toggleItalic: () => ({ run: vi.fn() }),
        toggleStrike: () => ({ run: vi.fn() }),
        toggleCode: () => ({ run: vi.fn() }),
        toggleBulletList: () => ({ run: vi.fn() }),
        toggleOrderedList: () => ({ run: vi.fn() }),
        toggleTaskList: () => ({ run: vi.fn() }),
        toggleBlockquote: () => ({ run: vi.fn() }),
        toggleCodeBlock: () => ({ run: vi.fn() }),
        setHorizontalRule: () => ({ run: vi.fn() }),
        setParagraph: () => ({ run: vi.fn() }),
        setHeading: () => ({ run: vi.fn() }),
        insertTable: () => ({ run: vi.fn() }),
        addRowBefore: () => ({ run: vi.fn() }),
        addRowAfter: () => ({ run: vi.fn() }),
        addColumnBefore: () => ({ run: vi.fn() }),
        addColumnAfter: () => ({ run: vi.fn() }),
        deleteRow: () => ({ run: vi.fn() }),
        deleteColumn: () => ({ run: vi.fn() }),
        deleteTable: () => ({ run: vi.fn() }),
        setLink: () => ({ run: vi.fn() }),
        unsetLink: () => ({ run: vi.fn() }),
        setImage: () => ({ run: vi.fn() }),
        run: vi.fn(),
      }),
    }),
    commands: {
      focus: vi.fn(),
      insertMermaid: vi.fn(),
    },
    getAttributes: () => ({ href: '' }),
    storage: {
      characterCount: {
        characters: () => characterCount,
        words: () => wordCount,
      },
    },
    // Event emitter methods for editor updates
    on: vi.fn(),
    off: vi.fn(),
    getText: () => 'mock text content',
    getHTML: () => '<p>mock html content</p>',
  });
};

describe('Toolbar Component', () => {
  describe('File operation emits', () => {
    it('emits openFile when Open button is clicked', async () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor(),
          },
        },
      });

      const openButton = wrapper.find('button[title*="Open"]');
      await openButton.trigger('click');

      expect(wrapper.emitted('openFile')).toBeTruthy();
    });

    it('emits saveFile when Save button is clicked', async () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor(),
          },
        },
      });

      const saveButton = wrapper.find('button[title*="Save (Ctrl+S)"]');
      await saveButton.trigger('click');

      expect(wrapper.emitted('saveFile')).toBeTruthy();
    });

    it('emits saveFileAs when Save As button is clicked', async () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor(),
          },
        },
      });

      const saveAsButton = wrapper.find('button[title*="Save As"]');
      await saveAsButton.trigger('click');

      expect(wrapper.emitted('saveFileAs')).toBeTruthy();
    });

    it('emits exportPdf when PDF button is clicked', async () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor(),
          },
        },
      });

      const pdfButton = wrapper.find('button[title="PDF"]');
      await pdfButton.trigger('click');

      expect(wrapper.emitted('exportPdf')).toBeTruthy();
    });
  });

  describe('Character and word count display', () => {
    it('displays character count from editor', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({ characterCount: 150 }),
          },
        },
      });

      expect(wrapper.text()).toContain('150 characters');
    });

    it('displays word count from editor', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({ wordCount: 25 }),
          },
        },
      });

      expect(wrapper.text()).toContain('25 words');
    });

    it('shows 0 counts when editor is not available', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: ref(null),
          },
        },
      });

      expect(wrapper.text()).toContain('0 characters');
      expect(wrapper.text()).toContain('0 words');
    });
  });

  describe('Undo/Redo buttons', () => {
    it('disables undo button when cannot undo', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({ canUndo: false }),
          },
        },
      });

      const undoButton = wrapper.find('button[title*="Undo"]');
      expect(undoButton.attributes('disabled')).toBeDefined();
    });

    it('disables redo button when cannot redo', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({ canRedo: false }),
          },
        },
      });

      const redoButton = wrapper.find('button[title*="Redo"]');
      expect(redoButton.attributes('disabled')).toBeDefined();
    });

    it('enables undo button when can undo', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({ canUndo: true }),
          },
        },
      });

      const undoButton = wrapper.find('button[title*="Undo"]');
      expect(undoButton.attributes('disabled')).toBeUndefined();
    });
  });

  describe('Formatting buttons active state', () => {
    it('shows bold button as active when bold is active', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({
              isActive: (name) => name === 'bold',
            }),
          },
        },
      });

      const boldButton = wrapper.find('button[title*="Bold"]');
      expect(boldButton.classes()).toContain('active');
    });

    it('shows italic button as active when italic is active', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({
              isActive: (name) => name === 'italic',
            }),
          },
        },
      });

      const italicButton = wrapper.find('button[title*="Italic"]');
      expect(italicButton.classes()).toContain('active');
    });

    it('shows strike button as active when strike is active', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({
              isActive: (name) => name === 'strike',
            }),
          },
        },
      });

      const strikeButton = wrapper.find('button[title*="Strikethrough"]');
      expect(strikeButton.classes()).toContain('active');
    });

    it('shows code button as active when code is active', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({
              isActive: (name) => name === 'code',
            }),
          },
        },
      });

      const codeButton = wrapper.find('button[title*="Inline code"]');
      expect(codeButton.classes()).toContain('active');
    });
  });

  describe('List buttons active state', () => {
    it('shows bullet list button as active', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({
              isActive: (name) => name === 'bulletList',
            }),
          },
        },
      });

      const bulletButton = wrapper.find('button[title*="Bullet list"]');
      expect(bulletButton.classes()).toContain('active');
    });

    it('shows ordered list button as active', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({
              isActive: (name) => name === 'orderedList',
            }),
          },
        },
      });

      const orderedButton = wrapper.find('button[title*="Numbered list"]');
      expect(orderedButton.classes()).toContain('active');
    });

    it('shows task list button as active', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({
              isActive: (name) => name === 'taskList',
            }),
          },
        },
      });

      const taskButton = wrapper.find('button[title*="Task list"]');
      expect(taskButton.classes()).toContain('active');
    });
  });

  describe('Table dropdown', () => {
    it('shows table menu when table button is clicked', async () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor(),
          },
        },
      });

      const tableButton = wrapper.find('button[title*="Table"]');
      await tableButton.trigger('click');

      expect(wrapper.find('.dropdown-menu').exists()).toBe(true);
    });

    it('hides table menu on second click', async () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor(),
          },
        },
      });

      const tableButton = wrapper.find('button[title*="Table"]');
      await tableButton.trigger('click');
      await tableButton.trigger('click');

      expect(wrapper.find('.dropdown-menu').exists()).toBe(false);
    });

    it('disables table operations when not in table', async () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({
              isActive: () => false,
            }),
          },
        },
      });

      const tableButton = wrapper.find('button[title*="Table"]');
      await tableButton.trigger('click');

      const addRowButton = wrapper.find('.dropdown-item:nth-child(3)');
      expect(addRowButton.attributes('disabled')).toBeDefined();
    });
  });

  describe('Heading select', () => {
    it('has heading options from 1 to 6 plus paragraph', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor(),
          },
        },
      });

      const select = wrapper.find('.heading-select');
      const options = select.findAll('option');

      expect(options.length).toBe(7); // Paragraph + 6 heading levels
      expect(options[0].text()).toBe('Paragraph');
      expect(options[1].text()).toBe('Heading 1');
      expect(options[6].text()).toBe('Heading 6');
    });

    it('shows current heading level', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor({
              isActive: (name, attrs) =>
                name === 'heading' && attrs?.level === 2,
            }),
          },
        },
      });

      const select = wrapper.find('.heading-select');
      expect((select.element as HTMLSelectElement).value).toBe('2');
    });

    it('calls setHeading when heading level is changed', async () => {
      const setHeadingRun = vi.fn();
      const mockEditor = ref({
        isActive: () => false,
        can: () => ({ undo: () => true, redo: () => true }),
        chain: () => ({
          focus: () => ({
            setHeading: () => ({ run: setHeadingRun }),
            setParagraph: () => ({ run: vi.fn() }),
            undo: () => ({ run: vi.fn() }),
            redo: () => ({ run: vi.fn() }),
            toggleBold: () => ({ run: vi.fn() }),
            toggleItalic: () => ({ run: vi.fn() }),
            toggleStrike: () => ({ run: vi.fn() }),
            toggleCode: () => ({ run: vi.fn() }),
            toggleBulletList: () => ({ run: vi.fn() }),
            toggleOrderedList: () => ({ run: vi.fn() }),
            toggleTaskList: () => ({ run: vi.fn() }),
            toggleBlockquote: () => ({ run: vi.fn() }),
            toggleCodeBlock: () => ({ run: vi.fn() }),
            setHorizontalRule: () => ({ run: vi.fn() }),
            insertTable: () => ({ run: vi.fn() }),
            addRowBefore: () => ({ run: vi.fn() }),
            addRowAfter: () => ({ run: vi.fn() }),
            addColumnBefore: () => ({ run: vi.fn() }),
            addColumnAfter: () => ({ run: vi.fn() }),
            deleteRow: () => ({ run: vi.fn() }),
            deleteColumn: () => ({ run: vi.fn() }),
            deleteTable: () => ({ run: vi.fn() }),
            setLink: () => ({ run: vi.fn() }),
            unsetLink: () => ({ run: vi.fn() }),
            setImage: () => ({ run: vi.fn() }),
            run: vi.fn(),
          }),
        }),
        commands: { focus: vi.fn(), insertMermaid: vi.fn() },
        getAttributes: () => ({ href: '' }),
        storage: { characterCount: { characters: () => 0, words: () => 0 } },
        on: vi.fn(),
        off: vi.fn(),
        getText: () => '',
        getHTML: () => '<p></p>',
      });

      const wrapper = mount(Toolbar, {
        global: {
          provide: { editor: mockEditor },
        },
      });

      const select = wrapper.find('.heading-select');
      await select.setValue('2');

      expect(setHeadingRun).toHaveBeenCalled();
    });

    it('calls setParagraph when paragraph option is selected', async () => {
      const setParagraphRun = vi.fn();
      const mockEditor = ref({
        isActive: (name: string, attrs?: Record<string, unknown>) =>
          name === 'heading' && attrs?.level === 2,
        can: () => ({ undo: () => true, redo: () => true }),
        chain: () => ({
          focus: () => ({
            setHeading: () => ({ run: vi.fn() }),
            setParagraph: () => ({ run: setParagraphRun }),
            undo: () => ({ run: vi.fn() }),
            redo: () => ({ run: vi.fn() }),
            toggleBold: () => ({ run: vi.fn() }),
            toggleItalic: () => ({ run: vi.fn() }),
            toggleStrike: () => ({ run: vi.fn() }),
            toggleCode: () => ({ run: vi.fn() }),
            toggleBulletList: () => ({ run: vi.fn() }),
            toggleOrderedList: () => ({ run: vi.fn() }),
            toggleTaskList: () => ({ run: vi.fn() }),
            toggleBlockquote: () => ({ run: vi.fn() }),
            toggleCodeBlock: () => ({ run: vi.fn() }),
            setHorizontalRule: () => ({ run: vi.fn() }),
            insertTable: () => ({ run: vi.fn() }),
            addRowBefore: () => ({ run: vi.fn() }),
            addRowAfter: () => ({ run: vi.fn() }),
            addColumnBefore: () => ({ run: vi.fn() }),
            addColumnAfter: () => ({ run: vi.fn() }),
            deleteRow: () => ({ run: vi.fn() }),
            deleteColumn: () => ({ run: vi.fn() }),
            deleteTable: () => ({ run: vi.fn() }),
            setLink: () => ({ run: vi.fn() }),
            unsetLink: () => ({ run: vi.fn() }),
            setImage: () => ({ run: vi.fn() }),
            run: vi.fn(),
          }),
        }),
        commands: { focus: vi.fn(), insertMermaid: vi.fn() },
        getAttributes: () => ({ href: '' }),
        storage: { characterCount: { characters: () => 0, words: () => 0 } },
        on: vi.fn(),
        off: vi.fn(),
        getText: () => '',
        getHTML: () => '<p></p>',
      });

      const wrapper = mount(Toolbar, {
        global: {
          provide: { editor: mockEditor },
        },
      });

      const select = wrapper.find('.heading-select');
      // Select is currently at heading 2 (due to isActive mock), change to paragraph
      await select.setValue('0');

      expect(setParagraphRun).toHaveBeenCalled();
    });

    it('does not call editor commands when editor is null', async () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: { editor: ref(null) },
        },
      });

      const select = wrapper.find('.heading-select');
      // This should not throw, just silently do nothing
      await select.setValue('2');

      // Test passes if no error is thrown
      expect(true).toBe(true);
    });
  });

  describe('Mermaid button', () => {
    it('renders Mermaid button', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor(),
          },
        },
      });

      const mermaidButton = wrapper.find('.mermaid-btn');
      expect(mermaidButton.exists()).toBe(true);
      expect(mermaidButton.text()).toContain('Mermaid');
    });
  });

  describe('Editor event listeners', () => {
    it('should register update listener when editor is available', () => {
      const mockEditor = createMockEditor();

      mount(Toolbar, {
        global: {
          provide: {
            editor: mockEditor,
          },
        },
      });

      // Verify that 'on' was called with 'update' event
      expect(mockEditor.value.on).toHaveBeenCalledWith('update', expect.any(Function));
    });

    it('should call getHTML when editor emits update (for token counting)', async () => {
      const mockEditor = createMockEditor();
      let updateCallback: (() => void) | undefined;

      // Make getHTML a spy
      mockEditor.value.getHTML = vi.fn().mockReturnValue('<p>mock html content</p>');

      // Capture the update callback when it's registered
      mockEditor.value.on = vi.fn((event: string, callback: () => void) => {
        if (event === 'update') {
          updateCallback = callback;
        }
      });

      mount(Toolbar, {
        global: {
          provide: {
            editor: mockEditor,
          },
        },
      });

      // Simulate editor update
      if (updateCallback) {
        updateCallback();
      }

      expect(mockEditor.value.getHTML).toHaveBeenCalled();
    });
  });

  describe('Token counter display', () => {
    it('should display token count section', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor(),
          },
        },
      });

      // Token counter should be visible by default
      expect(wrapper.text()).toContain('tokens');
    });

    it('should show model name in token counter', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor(),
          },
        },
      });

      // Should show the default model name (GPT-5)
      expect(wrapper.text()).toMatch(/GPT|Claude|Gemini|Llama/);
    });

    it('should have token model selector button', () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor(),
          },
        },
      });

      const tokenBtn = wrapper.find('.token-btn');
      expect(tokenBtn.exists()).toBe(true);
    });

    it('should toggle token menu when button clicked', async () => {
      const wrapper = mount(Toolbar, {
        global: {
          provide: {
            editor: createMockEditor(),
          },
        },
      });

      const tokenBtn = wrapper.find('.token-btn');
      await tokenBtn.trigger('click');

      // Menu should appear
      expect(wrapper.find('.token-menu').exists()).toBe(true);

      await tokenBtn.trigger('click');

      // Menu should disappear
      expect(wrapper.find('.token-menu').exists()).toBe(false);
    });
  });
});
