import React from 'react';
import { Link } from 'react-router-dom';
import { Button } from "../components/ui/button";
import { MoonIcon, SunIcon } from "@radix-ui/react-icons";
import { useTheme } from "./ThemeProvider";

export default function Navigation() {
  const { setTheme, theme } = useTheme();

  return (
    <nav className="border-b">
      <div className="container mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          <div className="flex items-center">
            <Link to="/">
              <span className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-teal-600 text-transparent bg-clip-text">SSI Portal</span>
            </Link>
          </div>
          <div className="hidden md:flex items-center space-x-4">
            <Link to="/portal" className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium">
              Training Modules
            </Link>
            <Link to="/performance" className="text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white px-3 py-2 rounded-md text-sm font-medium">
              Performance
            </Link>
            <Link to="/phc">
              <Button 
                variant="outline" 
                className="relative overflow-hidden group"
              >
                <span className="relative z-10">Get your PHC Now!!</span>
                <span className="absolute inset-0 overflow-hidden">
                  <span className="absolute inset-0 rounded-full opacity-50 blur-md filter group-hover:animate-pulse bg-gradient-to-r from-blue-400 to-teal-400"></span>
                </span>
                <span className="absolute inset-0 rounded-md opacity-50 animate-border-glow"></span>
              </Button>
            </Link>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              <SunIcon className="h-[1.2rem] w-[1.2rem] rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0" />
              <MoonIcon className="absolute h-[1.2rem] w-[1.2rem] rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100" />
              <span className="sr-only">Toggle theme</span>
            </Button>
          </div>
        </div>
      </div>
    </nav>
  );
}