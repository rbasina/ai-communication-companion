import { useDispatch, useSelector } from 'react-redux';
import { RootState } from '@/store';
import { setMode, setActive } from '@/store/slices/communicationSlice';
import Link from 'next/link';

export default function NavigationBar() {
  const dispatch = useDispatch();
  const { mode } = useSelector((state: RootState) => state.communication);

  const handleModeChange = (newMode: 'text' | 'audio' | 'video') => {
    console.log('NavigationBar: Changing mode to', newMode);
    // First set mode, then ensure it's active (in case it wasn't)
    dispatch(setMode(newMode));
    dispatch(setActive(true));
  };

  return (
    <div className="bg-white shadow-sm mb-6">
      <div className="container mx-auto px-4">
        <div className="flex justify-between items-center h-16">
          <Link href="/" className="text-xl font-semibold text-gray-900 hover:text-blue-600">
            AI Communication Companion
          </Link>
          
          <div className="flex items-center">
            <div className="flex space-x-2 mr-4">
              <button
                onClick={() => handleModeChange('text')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  mode === 'text'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Text Chat
              </button>
              <button
                onClick={() => handleModeChange('audio')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  mode === 'audio'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Audio Chat
              </button>
              <button
                onClick={() => handleModeChange('video')}
                className={`px-4 py-2 rounded-lg transition-colors ${
                  mode === 'video'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Video Chat
              </button>
            </div>
            
            <Link 
              href="/settings" 
              className="text-gray-600 hover:text-blue-600"
              title="Settings"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
              </svg>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
} 