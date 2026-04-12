import { useRef } from 'react'

// Backdrop wrapper that only closes the modal when the user actually clicked
// the backdrop (press started AND released there). Prevents accidental close
// when drag-selecting text inside the modal and releasing outside.
export default function Backdrop({ onClose, className, children }) {
  const pressRef = useRef(false)
  return (
    <div
      className={className}
      onMouseDown={e => { pressRef.current = e.target === e.currentTarget }}
      onMouseUp={e => {
        if (pressRef.current && e.target === e.currentTarget) onClose()
        pressRef.current = false
      }}
      onTouchStart={e => { pressRef.current = e.target === e.currentTarget }}
      onTouchEnd={e => {
        if (pressRef.current && e.target === e.currentTarget) onClose()
        pressRef.current = false
      }}
    >
      {children}
    </div>
  )
}
