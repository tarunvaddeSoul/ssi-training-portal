import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "./ui/button";
import { ArrowRightIcon } from "@radix-ui/react-icons";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white dark:from-gray-900 dark:to-gray-800">
      <main className="container mx-auto px-4 py-16 flex flex-col items-center justify-center text-center">
        <h1 className="text-5xl font-extrabold tracking-tight sm:text-6xl md:text-7xl mb-6">
          <span className="bg-clip-text text-transparent bg-gradient-to-r from-blue-600 to-teal-600">
            Take Control of Your Identity
          </span>
        </h1>
        <p className="mt-6 text-xl text-gray-600 dark:text-gray-300 max-w-3xl mx-auto mb-10">
          Self-Sovereign Identity (SSI) empowers you to manage your digital identity securely and privately.
          Learn how to take control of your personal data and interact with confidence in the digital world.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 mt-8">
          <Link to="/portal">
            <Button size="lg" className="w-full sm:w-auto">
              Enter Training Portal
              <ArrowRightIcon className="ml-2 h-4 w-4" />
            </Button>
          </Link>
          <Link to="/onboarding">
            <Button size="lg" variant="outline" className="w-full sm:w-auto">
              Student Onboarding
            </Button>
          </Link>
        </div>
      </main>
    </div>
  );
}