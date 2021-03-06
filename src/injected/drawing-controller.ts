// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import { autobind } from '@uifabric/utilities';
import { forOwn } from 'lodash';

import { AssessmentsProvider } from '../assessments/types/assessments-provider';
import { VisualizationConfigurationFactory } from '../common/configs/visualization-configuration-factory';
import { EnumHelper } from '../common/enum-helper';
import { FeatureFlags } from '../common/feature-flags';
import { HTMLElementUtils } from '../common/html-element-utils';
import { FeatureFlagStoreData } from '../common/types/store-data/feature-flag-store-data';
import { VisualizationType } from '../common/types/visualization-type';
import { DictionaryNumberTo } from '../types/common-types';
import { ErrorMessageContent } from './frameCommunicators/error-message-content';
import { FrameCommunicator, MessageRequest } from './frameCommunicators/frame-communicator';
import {
    AssessmentVisualizationInstance,
    HtmlElementAxeResultsHelper,
    HTMLIFrameResult,
} from './frameCommunicators/html-element-axe-results-helper';
import { FrameMessageResponseCallback } from './frameCommunicators/window-message-handler';
import { InstanceVisibilityChecker } from './instance-visibility-checker';
import { Drawer } from './visualization/drawer';
import { DrawerProvider } from './visualization/drawer-provider';

export interface VisualizationWindowMessage {
    visualizationType: VisualizationType;
    isEnabled: boolean;
    configId: string;
    elementResults?: AssessmentVisualizationInstance[];
    featureFlagStoreData?: FeatureFlagStoreData;
}

export class DrawingController {
    public static readonly triggerVisualizationCommand = 'insights.draw';

    private _drawers: DictionaryNumberTo<Drawer> = {};
    private _frameCommunicator: FrameCommunicator;
    private _instanceVisibilityChecker: InstanceVisibilityChecker;
    private _axeResultsHelper: HtmlElementAxeResultsHelper;
    private _htmlElementUtils: HTMLElementUtils;
    private _featureFlagStoreData: FeatureFlagStoreData;
    private _visualizationConfigurationFactory: VisualizationConfigurationFactory;
    private _drawerProvider: DrawerProvider;
    private _assessmentProvider: AssessmentsProvider;

    constructor(
        frameCommunicator: FrameCommunicator,
        instanceVisibilityChecker: InstanceVisibilityChecker,
        axeResultsHelper: HtmlElementAxeResultsHelper,
        htmlElementUtils: HTMLElementUtils,
        visualizationConfigurationFactory: VisualizationConfigurationFactory,
        drawerProvider: DrawerProvider,
        assessmentProvider: AssessmentsProvider,
    ) {
        this._frameCommunicator = frameCommunicator;
        this._instanceVisibilityChecker = instanceVisibilityChecker;
        this._axeResultsHelper = axeResultsHelper;
        this._htmlElementUtils = htmlElementUtils;
        this._visualizationConfigurationFactory = visualizationConfigurationFactory;
        this._drawerProvider = drawerProvider;
        this._assessmentProvider = assessmentProvider;
    }

    public initialize(): void {
        this._frameCommunicator.subscribe(DrawingController.triggerVisualizationCommand, this.onTriggerVisualization);
        this.setupDrawers();
    }

    private setupDrawers(): void {
        EnumHelper.getNumericValues(VisualizationType).forEach((visualizationType: VisualizationType) => {
            const config = this._visualizationConfigurationFactory.getConfiguration(visualizationType);
            if (this._assessmentProvider.isValidType(visualizationType)) {
                const steps = this._assessmentProvider.getStepMap(visualizationType);
                Object.keys(steps).forEach(key => {
                    const step = steps[key];
                    const id = config.getIdentifier(step.key);
                    this._drawers[id] = config.getDrawer(this._drawerProvider, id);
                });
            } else {
                const id = config.getIdentifier();
                this._drawers[id] = config.getDrawer(this._drawerProvider);
            }
        });
    }

    @autobind
    public processRequest(message: VisualizationWindowMessage): void {
        this._featureFlagStoreData = message.featureFlagStoreData;
        if (message.isEnabled) {
            const elementResultsByFrames = message.elementResults
                ? this._axeResultsHelper.splitResultsByFrame(message.elementResults)
                : null;
            this.enableVisualization(message.visualizationType, elementResultsByFrames, message.configId);
        } else {
            this.disableVisualization(message.visualizationType, message.configId);
        }
    }

    @autobind
    private onTriggerVisualization(
        result: VisualizationWindowMessage,
        error: ErrorMessageContent,
        sourceWindow: Window,
        responder?: FrameMessageResponseCallback,
    ): void {
        this.processRequest(result);
        this.invokeMethodIfExists(responder, null);
    }

    private enableVisualization(visualizationType: VisualizationType, elementResultsByFrames: HTMLIFrameResult[], configId: string): void {
        if (elementResultsByFrames) {
            for (let pos = 0; pos < elementResultsByFrames.length; pos++) {
                const resultsForFrame = elementResultsByFrames[pos];
                if (resultsForFrame.frame == null) {
                    if (this._featureFlagStoreData[FeatureFlags.showInstanceVisibility]) {
                        this._instanceVisibilityChecker.createVisibilityCheckerInterval(
                            configId,
                            visualizationType,
                            resultsForFrame.elementResults,
                        );
                    }
                    this.enableVisualizationInCurrentFrame(resultsForFrame.elementResults, configId);
                } else {
                    this.enableVisualizationInIFrames(visualizationType, resultsForFrame.frame, resultsForFrame.elementResults, configId);
                }
            }
        } else {
            this.enableVisualizationInCurrentFrame(null, configId);

            const iframes = this.getAllFrames();
            for (let pos = 0; pos < iframes.length; pos++) {
                this.enableVisualizationInIFrames(visualizationType, iframes[pos], null, configId);
            }
        }
    }

    private enableVisualizationInCurrentFrame(currentFrameResults: AssessmentVisualizationInstance[], configId: string): void {
        const drawer = this.getDrawer(configId);
        drawer.initialize({
            data: this.getInitialElements(currentFrameResults),
            featureFlagStoreData: this._featureFlagStoreData,
        });
        drawer.drawLayout();
    }

    private enableVisualizationInIFrames(
        visualizationType: VisualizationType,
        frame: HTMLIFrameElement,
        frameResults: AssessmentVisualizationInstance[],
        configId: string,
    ): void {
        const message: VisualizationWindowMessage = {
            elementResults: frameResults,
            isEnabled: true,
            visualizationType: visualizationType,
            featureFlagStoreData: this._featureFlagStoreData,
            configId: configId,
        };

        this._frameCommunicator.sendMessage(this.createFrameRequestMessage(frame, message));
    }

    private disableVisualization(visualizationType: VisualizationType, configId: string): void {
        this.disableVisualizationInCurrentFrame(configId);
        this.disableVisualizationInIFrames(visualizationType, configId);
        this._instanceVisibilityChecker.clearVisibilityCheck(configId, visualizationType);
    }

    private createFrameRequestMessage(
        frame: HTMLIFrameElement,
        message: VisualizationWindowMessage,
    ): MessageRequest<VisualizationWindowMessage> {
        return {
            command: DrawingController.triggerVisualizationCommand,
            frame: frame,
            message: message,
        } as MessageRequest<VisualizationWindowMessage>;
    }

    private disableVisualizationInIFrames(visualizationType: VisualizationType, configId: string): void {
        const iframes = this.getAllFrames();

        for (let i = 0; i < iframes.length; i++) {
            const iframe = iframes[i];
            if (iframe != null) {
                const message: VisualizationWindowMessage = {
                    isEnabled: false,
                    visualizationType: visualizationType,
                    configId: configId,
                };

                this._frameCommunicator.sendMessage(this.createFrameRequestMessage(iframe, message));
            }
        }
    }

    private disableVisualizationInCurrentFrame(configId: string): void {
        const drawer = this.getDrawer(configId);
        drawer.eraseLayout();
    }

    private getAllFrames(): NodeListOf<HTMLIFrameElement> {
        return this._htmlElementUtils.getAllElementsByTagName('iframe') as NodeListOf<HTMLIFrameElement>;
    }

    private getDrawer(configId: string): Drawer {
        return this._drawers[configId];
    }

    private invokeMethodIfExists(method: Function, data: any): void {
        if (method) {
            method(data);
        }
    }

    private getInitialElements(currentFrameResults: AssessmentVisualizationInstance[]): AssessmentVisualizationInstance[] {
        if (currentFrameResults == null) {
            return null;
        }

        return currentFrameResults.filter(result => {
            return result.isVisible !== false && result.isVisualizationEnabled !== false;
        });
    }

    public dispose(): void {
        forOwn(this._drawers, currentDrawer => {
            currentDrawer.eraseLayout();
        });
    }
}
