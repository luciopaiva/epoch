/// <reference path="../index.ts" />

module Epoch.Util {

    // re-used every time the method gets called
    var getTextWidthCanvas = document.createElement('canvas');

    /**
     * Uses canvas.measureText to compute and return the width of the given text of given font in pixels.
     *
     * @param {String} text The text to be rendered.
     *
     * @see http://stackoverflow.com/questions/118241/calculate-text-width-with-javascript/21015393#21015393
     */
    export function getTextWidth(text: string): number {
        const FONT = '8pt arial';
        var context = getTextWidthCanvas.getContext('2d');
        context.font = FONT;
        var metrics = context.measureText(text);
        return metrics.width;
    }
}
