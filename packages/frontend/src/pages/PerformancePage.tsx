import React, { useState, useEffect } from "react";
import axios from "axios";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import { Loader2 } from "lucide-react";
import { toast } from "../components/ui/use-toast";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { modules } from "../lib/modules";

interface ModuleMarks {
  module: string;
  marks: number;
}

export default function PerformancePage() {
  const [loading, setLoading] = useState(false);
  const [marks, setMarks] = useState<ModuleMarks[]>([]);
  const [connectionId, setConnectionId] = useState<string | null>(null);

  useEffect(() => {
    const storedConnectionId = localStorage.getItem("connectionId");
    if (storedConnectionId) {
      setConnectionId(storedConnectionId);
    }
  }, []);

  const requestPerformanceData = async () => {
    if (!connectionId) {
      toast({
        title: "Error",
        description:
          "No connection ID found. Please connect your wallet first.",
        variant: "destructive",
      });
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post(
        `http://localhost:3000/agent/check-performance/connectionId/${connectionId}`
      );
      const proofRecordId = response.data.data.proofRecord.id;
      await checkVerificationState(proofRecordId);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to request performance data. Please try again.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const checkVerificationState = async (id: string) => {
    let state = "request-sent";
    while (state !== "done" && state !== "abandoned") {
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Poll every 2 seconds
      try {
        const response = await axios.get(
          `http://localhost:3000/agent/verification-state/id/${id}`
        );
        state = response.data.data.state;
        if (state === "done") {
          await fetchMarks(id);
          break;
        } else if (state === "abandoned") {
          toast({
            title: "Error",
            description: "Verification failed. Please try again.",
            variant: "destructive",
          });
          break;
        }
      } catch (err) {
        toast({
          title: "Error",
          description: "Failed to check verification state. Please try again.",
          variant: "destructive",
        });
        break;
      }
    }
  };

  const fetchMarks = async (id: string) => {
    try {
      const response = await axios.get(
        `http://localhost:3000/agent/requested-data/id/${id}`
      );
      const requestedProof = response.data.data.requestedProof;

      // Map module numbers to actual module titles
      const moduleMarks: ModuleMarks[] = Object.entries(requestedProof).map(
        ([key, value]: [string, any]) => {
          // Extract module number from "Requesting Marks of Module X"
          const moduleNumber = parseInt(key.match(/\d+/)?.[0] || "0", 10);
          // Get the module title from the modules array based on the extracted number
          const moduleTitle =
            modules[moduleNumber - 1]?.title || `Module ${moduleNumber}`;

          return {
            module: moduleTitle,
            marks: parseInt(value.raw, 10),
          };
        }
      );

      setMarks(moduleMarks);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch marks. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Performance Dashboard</h1>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Your Module Performance</CardTitle>
        </CardHeader>
        <CardContent>
          {marks.length === 0 ? (
            <div className="text-center">
              <p className="mb-4">
                Click the button below to fetch your performance data.
              </p>
              <Button onClick={requestPerformanceData} disabled={loading}>
                {loading ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  "Fetch Performance Data"
                )}
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {marks.map((mark) => (
                  <Card key={mark.module}>
                    <CardHeader>
                      <CardTitle>{mark.module}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-2xl font-bold">{mark.marks}%</p>
                    </CardContent>
                  </Card>
                ))}
              </div>
              <div className="h-[400px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={marks}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="module" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="marks" fill="#8884d8" name="Marks" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
