import { create } from 'zustand'

// Tiny standalone store for global save status.
// Separated from the main app store so that updating the status
// does not trigger the main store's immediate-save subscriber.
// Status values: 'idle' | 'saving' | 'saved' | 'failed' | 'stale'
//   'stale' = cloud is newer than local — refusing to overwrite.
const useSaveStatus = create((set) => ({
  status: 'idle',
  message: '',
  setStatus: (status, message = '') => set({ status, message }),
}))

export default useSaveStatus
