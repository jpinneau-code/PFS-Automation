'use client'

import React, { useRef, useEffect, useCallback } from 'react'

interface RichTextEditorProps {
  value: string
  onChange: (value: string) => void
  placeholder?: string
}

export default function RichTextEditor({ value, onChange, placeholder }: RichTextEditorProps) {
  const editorRef = useRef<HTMLDivElement>(null)
  const isInternalChange = useRef(false)
  const savedSelection = useRef<Range | null>(null)

  useEffect(() => {
    if (editorRef.current && !isInternalChange.current) {
      if (editorRef.current.innerHTML !== value) {
        editorRef.current.innerHTML = value || ''
      }
    }
    isInternalChange.current = false
  }, [value])

  const handleInput = useCallback(() => {
    if (editorRef.current) {
      isInternalChange.current = true
      onChange(editorRef.current.innerHTML)
    }
  }, [onChange])

  const saveSelection = () => {
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0) {
      savedSelection.current = sel.getRangeAt(0).cloneRange()
    }
  }

  const restoreSelection = () => {
    const sel = window.getSelection()
    if (sel && savedSelection.current) {
      sel.removeAllRanges()
      sel.addRange(savedSelection.current)
    }
  }

  const execCommand = (command: string) => {
    // Restore selection before executing command
    editorRef.current?.focus()
    restoreSelection()

    // Execute the command
    document.execCommand(command, false)

    // Save the new selection
    saveSelection()

    // Trigger change
    handleInput()
  }

  const handleSelectionChange = () => {
    // Only save if selection is within our editor
    const sel = window.getSelection()
    if (sel && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
      saveSelection()
    }
  }

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange)
    return () => {
      document.removeEventListener('selectionchange', handleSelectionChange)
    }
  }, [])

  const ToolbarButton = ({ command, icon, title }: { command: string; icon: React.ReactNode; title: string }) => (
    <button
      type="button"
      onMouseDown={(e) => {
        e.preventDefault()
        execCommand(command)
      }}
      className="p-1.5 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded transition-colors"
      title={title}
    >
      {icon}
    </button>
  )

  return (
    <div className="border border-gray-300 rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 focus-within:border-transparent">
      {/* Toolbar */}
      <div className="flex items-center gap-0.5 px-2 py-1.5 bg-gray-50 border-b border-gray-300">
        <ToolbarButton
          command="bold"
          title="Bold"
          icon={<span className="font-bold text-sm">B</span>}
        />
        <ToolbarButton
          command="italic"
          title="Italic"
          icon={<span className="italic text-sm">I</span>}
        />
        <ToolbarButton
          command="underline"
          title="Underline"
          icon={<span className="underline text-sm">U</span>}
        />
        <ToolbarButton
          command="strikeThrough"
          title="Strikethrough"
          icon={<span className="line-through text-sm">S</span>}
        />

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton
          command="insertUnorderedList"
          title="Bullet list"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="4" cy="6" r="2"/>
              <circle cx="4" cy="12" r="2"/>
              <circle cx="4" cy="18" r="2"/>
              <rect x="9" y="5" width="12" height="2"/>
              <rect x="9" y="11" width="12" height="2"/>
              <rect x="9" y="17" width="12" height="2"/>
            </svg>
          }
        />
        <ToolbarButton
          command="insertOrderedList"
          title="Numbered list"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
              <text x="1" y="8" fontSize="7" fontFamily="sans-serif">1.</text>
              <text x="1" y="14" fontSize="7" fontFamily="sans-serif">2.</text>
              <text x="1" y="20" fontSize="7" fontFamily="sans-serif">3.</text>
              <rect x="11" y="5" width="10" height="2"/>
              <rect x="11" y="11" width="10" height="2"/>
              <rect x="11" y="17" width="10" height="2"/>
            </svg>
          }
        />

        <div className="w-px h-5 bg-gray-300 mx-1" />

        <ToolbarButton
          command="removeFormat"
          title="Clear formatting"
          icon={
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 4l6 16"/>
              <path d="M4 4h12"/>
              <path d="M3 21l18-18"/>
            </svg>
          }
        />
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        contentEditable
        onInput={handleInput}
        onBlur={handleInput}
        className="min-h-[100px] max-h-[300px] overflow-y-auto px-3 py-2 focus:outline-none [&_ul]:list-disc [&_ul]:pl-6 [&_ul]:my-2 [&_ol]:list-decimal [&_ol]:pl-6 [&_ol]:my-2 [&_li]:my-1"
        style={{ wordBreak: 'break-word' }}
        data-placeholder={placeholder}
        suppressContentEditableWarning
      />

      <style jsx>{`
        [contenteditable]:empty:before {
          content: attr(data-placeholder);
          color: #9ca3af;
          pointer-events: none;
        }
      `}</style>
    </div>
  )
}
