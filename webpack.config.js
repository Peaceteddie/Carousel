const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

module.exports = {
    entry: {
        background: './src/background.ts',
        content: './src/content.ts',
        popup: './src/popup/popup.ts',
    },
    module: {
        rules: [
            {
                test: /\.tsx?$/,
                use: 'ts-loader',
                exclude: /node_modules/,
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader'],
            },
        ],
    },
    resolve: {
        extensions: ['.tsx', '.ts', '.js'],
        alias: {
            swiper$: 'swiper/bundle',
        },
    },
    output: {
        filename: '[name].js',
        path: path.resolve(__dirname, 'dist'),
    },
    devtool: false,
    optimization: {
        minimize: false
    },
    performance: {
        hints: false
    },
    plugins: [
        new CopyPlugin({
            patterns: [
                { from: 'src/popup/popup.html', to: 'popup.html' },
                { from: 'src/popup/popup.css', to: 'popup.css' },
            ],
        }),
    ],
};
