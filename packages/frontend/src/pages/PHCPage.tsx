import React, { useState, useEffect } from "react";
import { Button } from "../components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "../components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "../components/ui/dialog";
import { Step, Stepper } from "../components/ui/stepper";
import { Input } from "../components/ui/input";
import { Alert, AlertDescription, AlertTitle } from "../components/ui/alert";
import axios from "axios";

export default function PHCPage() {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [verificationState, setVerificationState] = useState("");
  const [verificationId, setVerificationId] = useState("");
  const [qrCode, setQrCode] = useState("");
  const [name, setName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [issuanceState, setIssuanceState] = useState("");

  const verifyPHC = async () => {
    try {
      const response = await axios.post(
        "http://localhost:3000/agent/verify-phc"
      );
      const data = response.data;
      if (data.statusCode === 201) {
        setVerificationId(data.data.proofRecord.id);
        setQrCode(data.data.proofUrl);
        setCurrentStep(1);
      } else {
        throw new Error("Failed to initiate verification");
      }
    } catch (error) {
      setErrorMessage("Failed to initiate verification. Please try again.");
    }
  };

  const checkVerificationState = async () => {
    try {
      const response = await axios.get(
        `http://localhost:3000/agent/verification-state/id/${verificationId}`
      );
      const data = response.data;
      if (data.statusCode === 200) {
        setVerificationState(data.data.state);
        if (data.data.state === "abandoned") {
          setErrorMessage(data.data.errorMessage || "Verification abandoned");
          setCurrentStep(2);
        } else if (data.data.state === "done") {
          setErrorMessage("Valid PHC already exists in your wallet");
          //   setCurrentStep(3);
        }
      }
    } catch (error) {
      setErrorMessage("Failed to check verification state. Please try again.");
    }
  };

  const issuePHC = async () => {
    try {
      const encodedName = encodeURIComponent(name);
      const response = await axios.post(
        `http://localhost:3000/agent/issue-phc/name/${encodedName}`
      );
      const data = response.data;
      if (data.statusCode === 201) {
        setQrCode(data.data.credentialUrl);
        setVerificationId(data.data.credentialRecord.id);
        setCurrentStep(3);
      } else {
        throw new Error("Failed to issue PHC");
      }
    } catch (error) {
      setErrorMessage("Failed to issue PHC. Please try again.");
    }
  };

  const checkIssuanceState = async () => {
    try {
      const response = await axios.get(
        `http://localhost:3000/agent/credential-state/id/${verificationId}`
      );
      const data = response.data;
      if (data.statusCode === 200) {
        setIssuanceState(data.data.state);
        if (data.data.state === "abandoned") {
          setErrorMessage(data.data.errorMessage || "Issuance abandoned");
        } else if (data.data.state === "done") {
          setErrorMessage("");
          setCurrentStep(4);
        }
      }
    } catch (error) {
      setErrorMessage("Failed to check issuance state. Please try again.");
    }
  };

  useEffect(() => {
    let intervalId: string | number | NodeJS.Timeout | undefined;
    if (currentStep === 1) {
      intervalId = setInterval(checkVerificationState, 5000);
    } else if (currentStep === 3) {
      intervalId = setInterval(checkIssuanceState, 5000);
    }
    return () => clearInterval(intervalId);
  }, [currentStep, verificationId]);

  const steps: Step[] = [
    { title: "Initiate", description: "Start PHC verification process" },
    { title: "Verify", description: "Verify existing PHC" },
    { title: "Issue", description: "Issue new PHC if needed" },
    { title: "Scan", description: "Scan QR code with your wallet" },
    { title: "Complete", description: "PHC process completed" },
  ];

  return (
    <div className="container mx-auto p-4">
      <h1 className="text-3xl font-bold mb-6">Personhood Credential (PHC)</h1>
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Get Your Personhood Credential</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center">
            <p className="mb-4">
              A Personhood Credential (PHC) is a unique digital credential that
              verifies your identity as a real person without revealing personal
              information.
            </p>
            <Button onClick={() => setIsModalOpen(true)}>
              Get your PHC Now!!
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Get Your Personhood Credential</DialogTitle>
          </DialogHeader>
          <Stepper steps={steps} currentStep={currentStep} />
          <div className="mt-4">
            {currentStep === 0 && (
              <Button onClick={verifyPHC}>Start PHC Process</Button>
            )}
            {currentStep === 1 && (
              <div>
                <p>Scan this QR code with your wallet to verify your PHC:</p>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrCode}`}
                  alt="Verification QR Code"
                  className="mx-auto mt-4"
                />
              </div>
            )}
            {currentStep === 2 && (
              <div>
                <Input
                  type="text"
                  placeholder="Enter your name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mb-4"
                />
                <Button onClick={issuePHC} disabled={!name}>
                  Issue New PHC
                </Button>
              </div>
            )}
            {currentStep === 3 && (
              <div>
                <p>Scan this QR code with your wallet to receive your PHC:</p>
                <img
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrCode}`}
                  alt="Issuance QR Code"
                  className="mx-auto mt-4"
                />
              </div>
            )}
            {currentStep === 4 && (
              <Alert>
                <AlertTitle>Success!</AlertTitle>
                <AlertDescription>
                  Your PHC has been issued and added to your wallet.
                </AlertDescription>
              </Alert>
            )}
            {errorMessage && (
              <Alert variant="destructive">
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
