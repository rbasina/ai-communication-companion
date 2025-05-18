import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import LLMConfig from '@/components/LLMConfig';
import NavigationBar from '@/components/NavigationBar';

export default function Settings() {
  const [activeTab, setActiveTab] = useState<'general' | 'llm' | 'privacy'>('general');
  
  return (
    <div className="min-h-screen bg-gray-50">
      <Head>
        <title>Settings - AI Communication Companion</title>
        <meta name="description" content="Configure your AI Communication Companion" />
        <link rel="icon" href="/favicon.ico" />
      </Head>
      
      <NavigationBar />
      
      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          <div className="mb-6">
            <h1 className="text-3xl font-bold text-gray-900">Settings</h1>
            <p className="text-gray-600">Configure your AI Communication Companion</p>
          </div>
          
          <div className="flex mb-6 border-b">
            <button 
              className={`px-4 py-2 font-medium ${activeTab === 'general' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
              onClick={() => setActiveTab('general')}
            >
              General
            </button>
            <button 
              className={`px-4 py-2 font-medium ${activeTab === 'llm' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
              onClick={() => setActiveTab('llm')}
            >
              LLM Integration
            </button>
            <button 
              className={`px-4 py-2 font-medium ${activeTab === 'privacy' ? 'text-blue-600 border-b-2 border-blue-600' : 'text-gray-500'}`}
              onClick={() => setActiveTab('privacy')}
            >
              Privacy
            </button>
          </div>
          
          {activeTab === 'general' && (
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
              <h2 className="text-xl font-bold mb-4 text-blue-800">General Settings</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Interface Theme
                  </label>
                  <select className="w-full p-2 border border-gray-300 rounded">
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System (Auto)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Notification Sounds
                  </label>
                  <div className="flex items-center">
                    <input type="checkbox" className="mr-2" />
                    <span>Enable notification sounds</span>
                  </div>
                </div>
                
                <div>
                  <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded mt-4">
                    Reset Application
                  </button>
                  <p className="text-xs text-gray-500 mt-1">
                    This will clear all saved data and reset the application to its default state.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          {activeTab === 'llm' && (
            <LLMConfig />
          )}
          
          {activeTab === 'privacy' && (
            <div className="bg-white p-6 rounded-xl shadow-md border border-gray-200">
              <h2 className="text-xl font-bold mb-4 text-blue-800">Privacy Settings</h2>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Data Collection
                  </label>
                  <div className="flex items-center">
                    <input type="checkbox" className="mr-2" />
                    <span>Allow anonymous usage data collection</span>
                  </div>
                  <p className="text-xs text-gray-500 mt-1">
                    This helps us improve the application but doesn't collect any personal information.
                  </p>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Conversation History
                  </label>
                  <div className="flex items-center">
                    <input type="checkbox" className="mr-2" checked />
                    <span>Save conversation history locally</span>
                  </div>
                </div>
                
                <div>
                  <button className="bg-red-600 hover:bg-red-700 text-white px-4 py-2 rounded mt-4">
                    Clear All Data
                  </button>
                  <p className="text-xs text-gray-500 mt-1">
                    This will permanently delete all your conversation history and settings.
                  </p>
                </div>
              </div>
            </div>
          )}
          
          <div className="mt-8 text-center">
            <Link href="/" className="text-blue-600 hover:underline">
              Back to Dashboard
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
} 