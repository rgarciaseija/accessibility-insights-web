// Copyright (c) Microsoft Corporation. All rights reserved.
// Licensed under the MIT License.
import * as Puppeteer from 'puppeteer';

import { forceTestFailure } from './force-test-failure';
import { takeScreenshot } from './generate-screenshot';
import { DEFAULT_NEW_PAGE_WAIT_TIMEOUT_MS, DEFAULT_PAGE_ELEMENT_WAIT_TIMEOUT_MS } from './timeouts';

export class Page {
    constructor(private readonly underlyingPage: Puppeteer.Page) {
        underlyingPage.on('error', error => {
            forceTestFailure(`error occurred - ${error.message}`);
        });

        underlyingPage.on('pageerror', error => {
            forceTestFailure(`Unhandled pageerror (console.error) emitted from page '${underlyingPage.url()}': ${error}`);
        });
        underlyingPage.on('requestfailed', request => {
            forceTestFailure(`request failed - ${request.failure().errorText}, ${request.url()}`);
        });
        underlyingPage.on('response', response => {
            if (response.status() >= 400) {
                forceTestFailure(`response error - ${response.status()}, ${response.url()}`);
            }
        });
    }

    public async goto(url: string): Promise<void> {
        await this.screenshotOnError(async () => await this.underlyingPage.goto(url, { timeout: DEFAULT_NEW_PAGE_WAIT_TIMEOUT_MS }));
    }

    public async close(ignoreIfAlreadyClosed: boolean = false): Promise<void> {
        if (ignoreIfAlreadyClosed && this.underlyingPage.isClosed()) {
            return;
        }
        await this.screenshotOnError(async () => await this.underlyingPage.close());
    }

    public async bringToFront(): Promise<void> {
        await this.screenshotOnError(async () => await this.underlyingPage.bringToFront());
    }

    public async evaluate(fn: Puppeteer.EvaluateFn, ...args: any[]): Promise<any> {
        return await this.screenshotOnError(async () => await this.underlyingPage.evaluate(fn, ...args));
    }

    public async getMatchingElements<T>(selector: string, elementProperty: keyof Element): Promise<T[]> {
        return await this.screenshotOnError(
            async () =>
                await this.evaluate(
                    (selectorInEvaluate, elementPropertyInEvaluate) => {
                        const elements = Array.from(document.querySelectorAll(selectorInEvaluate));
                        return elements.map(element => element[elementPropertyInEvaluate]);
                    },
                    selector,
                    elementProperty,
                ),
        );
    }

    public async waitForSelector(selector: string): Promise<Puppeteer.ElementHandle<Element>> {
        return await this.screenshotOnError(
            async () => await this.underlyingPage.waitForSelector(selector, { timeout: DEFAULT_PAGE_ELEMENT_WAIT_TIMEOUT_MS }),
        );
    }

    public async waitForSelectorToDisappear(selector: string): Promise<void> {
        await this.screenshotOnError(
            async () =>
                await this.underlyingPage.waitFor(
                    selectorInEvaluate => !document.querySelector(selectorInEvaluate),
                    { timeout: DEFAULT_PAGE_ELEMENT_WAIT_TIMEOUT_MS },
                    selector,
                ),
        );
    }

    public async clickSelector(selector: string): Promise<void> {
        const element = await this.waitForSelector(selector);
        await this.screenshotOnError(async () => {
            await element.click();
        });
    }

    public async clickSelectorXPath(xPathString: string): Promise<void> {
        await this.screenshotOnError(async () => {
            const element = await this.underlyingPage.waitForXPath(xPathString, { timeout: DEFAULT_PAGE_ELEMENT_WAIT_TIMEOUT_MS });
            await element.click();
        });
    }

    public url(): URL {
        // We use target().url() instead of just url() here because:
        // * They ought to be equivalent in every case we care to test
        // * There is at least one edge case (the background page) where we've seen puppeteer
        //   mis-populating url() but not target().url() as ':'
        return new URL(this.underlyingPage.target().url());
    }

    public async keyPress(key: string): Promise<void> {
        await this.underlyingPage.keyboard.press(key);
    }

    public async getPrintableHtmlElement(selector: string): Promise<Node> {
        return await this.screenshotOnError(async () => {
            const html = await this.underlyingPage.$eval(selector, el => el.outerHTML);
            return generateFormattedHtml(html);
        });
    }

    private async screenshotOnError<T>(fn: () => Promise<T>): Promise<T> {
        try {
            return await fn();
        } catch (error) {
            await takeScreenshot(this.underlyingPage);
            throw error;
        }
    }
}

function generateFormattedHtml(innerHTMLString: string): Node {
    const template = document.createElement('template');

    // office fabric generates a random class & id name which changes every time.
    // We remove the random number before snapshot comparison to avoid flakiness
    innerHTMLString = innerHTMLString.replace(/(class|id)="[\w\s-]+[\d]+"/g, (subString, args) => {
        return subString.replace(/[\d]+/g, '000');
    });

    template.innerHTML = innerHTMLString.trim();

    return template.content.cloneNode(true);
}
