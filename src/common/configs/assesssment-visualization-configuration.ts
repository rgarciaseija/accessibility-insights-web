// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { ToggleActionPayload } from '../../background/actions/action-payloads';
import { UniquelyIdentifiableInstances } from '../../background/instance-identifier-generator';
import { TestViewProps } from '../../DetailsView/components/test-view';
import { Analyzer } from '../../injected/analyzers/analyzer';
import { AnalyzerProvider } from '../../injected/analyzers/analyzer-provider';
import { HtmlElementAxeResults, ScannerUtils } from '../../injected/scanner-utils';
import { PropertyBags, VisualizationInstanceProcessorCallback } from '../../injected/visualization-instance-processor';
import { Drawer } from '../../injected/visualization/drawer';
import { DrawerProvider } from '../../injected/visualization/drawer-provider';
import { ScanResults } from '../../scanner/iruleresults';
import { DictionaryStringTo } from '../../types/common-types';
import { IAnalyzerTelemetryCallback } from '../types/analyzer-telemetry-callbacks';
import { AssessmentData, AssessmentStoreData } from '../types/store-data/assessment-result-data';
import { ScanData, TestsEnabledState } from '../types/store-data/visualization-store-data';
import { TelemetryProcessor } from '../types/telemetry-processor';

export interface AssesssmentVisualizationConfiguration {
    key: string;
    getTestView: (props: TestViewProps) => JSX.Element;
    getStoreData: (data: TestsEnabledState) => ScanData;
    enableTest: (data: ScanData, payload: ToggleActionPayload) => void;
    disableTest: (data: ScanData, step?: string) => void;
    getTestStatus: (data: ScanData, step?: string) => boolean;
    getAssessmentData?: (data: AssessmentStoreData) => AssessmentData;
    setAssessmentData?: (data: AssessmentStoreData, selectorMap: DictionaryStringTo<any>, instanceMap?: DictionaryStringTo<any>) => void;
    analyzerMessageType: string;
    analyzerProgressMessageType?: string;
    resultProcessor?: (scanner: ScannerUtils) => (results: ScanResults) => DictionaryStringTo<HtmlElementAxeResults>;
    telemetryProcessor?: TelemetryProcessor<IAnalyzerTelemetryCallback>;
    getAnalyzer: (analyzerProvider: AnalyzerProvider, testStep?: string) => Analyzer;
    getIdentifier: (testStep?: string) => string;
    visualizationInstanceProcessor: (testStep?: string) => VisualizationInstanceProcessorCallback<PropertyBags, PropertyBags>;
    getNotificationMessage: (selectorMap: DictionaryStringTo<any>, testStep?: string) => string;
    getDrawer: (provider: DrawerProvider, testStep?: string) => Drawer;
    getSwitchToTargetTabOnScan: (testStep?: string) => boolean;
    getInstanceIdentiferGenerator: (testStep?: string) => (instance: UniquelyIdentifiableInstances) => string;
    getUpdateVisibility: (testStep?: string) => boolean;
}
